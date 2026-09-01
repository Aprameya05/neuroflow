"""
Real-time cognitive load inference — NeuroFlow v2.

Three-layer inference stack:
  1.  Feature extraction   — 9 behavioural signals → normalised feature vector
  2.  Load estimation      — ONNX BiLSTM (prod) or improved heuristic (dev)
  3.  Post-processing      — Kalman filter, adaptive baseline, fatigue integral,
                             Mahalanobis confidence, anomaly detection

New in v2
---------
* Kalman filter replaces raw EMA for load smoothing (less lag, better noise
  rejection).
* Per-session adaptive baseline: the inferencer learns each user's personal
  behavioural baseline over the first 60 windows and re-normalises toward it.
* Fatigue index: cumulative integral of load over time, decaying with a
  half-life of 20 min. Distinguishes acute overload from chronic fatigue.
* Mahalanobis confidence: high confidence when the current feature vector is
  close to the distribution seen during calibration; low when the signal is
  an outlier (e.g. user walked away).
* Anomaly detection: spike alert when instantaneous load jumps > 0.25 in one
  window relative to the Kalman-smoothed baseline.
"""
from __future__ import annotations

import math
import logging
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Feature schema
# ---------------------------------------------------------------------------

FEATURE_NAMES: list[str] = [
    "keystroke_iki_ms",        # inter-keystroke interval (ms)    ↑ = higher load
    "mouse_velocity",           # px/ms                            ↓ = higher load
    "mouse_acceleration",       # std-dev of velocity              ↑ = higher load
    "mouse_direction_changes",  # angular reversals per window     ↑ = uncertainty
    "scroll_velocity",          # px/ms                            ↓ = higher load
    "error_rate",               # backspaces / total keys          ↑ = higher load
    "tab_switches",             # context switches                 ↑ = higher load
    "pause_duration_ms",        # longest inactivity (ms)          ↑ = higher load
    "copy_paste_count",         # knowledge-gap proxy              ↑ = higher load
]
N_FEATURES = len(FEATURE_NAMES)
SEQ_LEN = 30  # must match training config


# ---------------------------------------------------------------------------
# Data-transfer objects
# ---------------------------------------------------------------------------

@dataclass
class BehavioralSignal:
    timestamp_ms: int
    keystroke_iki_ms: Optional[float]
    mouse_velocity: float
    mouse_acceleration: float
    mouse_direction_changes: int
    scroll_velocity: float
    error_rate: float
    tab_switches: int
    pause_duration_ms: float
    copy_paste_count: int


@dataclass
class CognitiveLoadEstimate:
    load_score: float          # Kalman-smoothed, 0.0–1.0
    raw_load: float            # pre-Kalman raw estimate
    confidence: float          # 0.0–1.0 (Mahalanobis-derived)
    dominant_signal: str       # feature with highest z-score
    window_size_ms: int
    model_type: str            # "onnx" | "heuristic"
    # v2 additions
    fatigue_index: float       # 0.0–1.0 cumulative load integral
    is_anomaly: bool           # sudden load spike detected
    predicted_load: float      # 1-step-ahead Kalman prediction
    session_percentile: float  # where this window falls in session distribution


# ---------------------------------------------------------------------------
# Kalman 1-D tracker
# ---------------------------------------------------------------------------

class KalmanFilter1D:
    """
    Constant-velocity Kalman filter for a scalar load signal.

    State: [value, velocity]
    Observation: scalar load estimate (0..1)

    Process noise Q and measurement noise R tuned for 100 ms cognitive
    load dynamics: allows moderate state changes while rejecting spike noise.
    """

    def __init__(self, q: float = 0.002, r: float = 0.05) -> None:
        self.x = np.array([0.5, 0.0], dtype=np.float64)   # [value, velocity]
        self.P = np.eye(2, dtype=np.float64) * 1.0

        dt = 1.0
        self.F = np.array([[1.0, dt], [0.0, 1.0]], dtype=np.float64)
        self.H = np.array([[1.0, 0.0]], dtype=np.float64)
        self.Q = np.array([[q, 0.0], [0.0, q * 0.1]], dtype=np.float64)
        self.R = np.array([[r]], dtype=np.float64)

    def predict(self) -> float:
        x_pred = self.F @ self.x
        return float(np.clip(x_pred[0], 0.0, 1.0))

    def update(self, observation: float) -> float:
        z = np.array([[observation]], dtype=np.float64)
        x_pred = self.F @ self.x
        P_pred = self.F @ self.P @ self.F.T + self.Q
        S = self.H @ P_pred @ self.H.T + self.R
        K = P_pred @ self.H.T @ np.linalg.inv(S)
        self.x = x_pred + K @ (z - self.H @ x_pred)
        self.P = (np.eye(2) - K @ self.H) @ P_pred
        self.x[1] = float(np.clip(self.x[1], -0.05, 0.05))
        return float(np.clip(self.x[0], 0.0, 1.0))


# ---------------------------------------------------------------------------
# Per-session adaptive baseline (Welford online algorithm)
# ---------------------------------------------------------------------------

class SessionBaseline:
    """
    Tracks per-session mean/variance using Welford's online algorithm.

    After WARMUP_WINDOWS observations, normalisation switches from global
    training stats to session-specific stats, closing the calibration gap
    for users whose behaviour deviates from the training distribution.
    """

    WARMUP_WINDOWS = 60  # ~6 s at 100 ms sampling rate

    def __init__(self) -> None:
        self.n = 0
        self.mean = np.zeros(N_FEATURES, dtype=np.float64)
        self.M2 = np.ones(N_FEATURES, dtype=np.float64)

    @property
    def std(self) -> np.ndarray:
        return np.sqrt(self.M2 / max(self.n - 1, 1))

    @property
    def is_warm(self) -> bool:
        return self.n >= self.WARMUP_WINDOWS

    def update(self, features: np.ndarray) -> None:
        self.n += 1
        delta = features - self.mean
        self.mean += delta / self.n
        self.M2 += delta * (features - self.mean)

    def normalise(self, features: np.ndarray) -> np.ndarray:
        return (features - self.mean) / (self.std + 1e-8)

    def mahalanobis_confidence(self, features: np.ndarray) -> float:
        """
        Diagonal Mahalanobis distance → confidence score.

        Returns ~1.0 for in-distribution feature vectors (user is actively
        working) and < 0.5 for outliers (user walked away, extreme behaviour).
        """
        if not self.is_warm:
            return 0.4
        z = (features - self.mean) / (self.std + 1e-8)
        d2 = float(np.sum(z ** 2))
        confidence = math.exp(-d2 / (2.0 * N_FEATURES))
        return float(np.clip(confidence * 2.0, 0.0, 1.0))


# ---------------------------------------------------------------------------
# Fatigue tracker
# ---------------------------------------------------------------------------

class FatigueTracker:
    """
    Cumulative cognitive load integral with exponential decay.

    Distinguishes acute overload (load spike) from chronic fatigue
    (sustained elevated load over a session).  Half-life is 20 min:
    a user who steps away recovers; one who stays cognitively busy
    accumulates fatigue.
    """

    HALF_LIFE_MS = 20 * 60 * 1000  # 20 minutes

    def __init__(self) -> None:
        self.index: float = 0.0
        self.last_ts_ms: Optional[int] = None
        self._decay_k = math.log(2) / self.HALF_LIFE_MS

    def update(self, load_score: float, ts_ms: int) -> float:
        if self.last_ts_ms is None:
            self.last_ts_ms = ts_ms
            return 0.0
        dt = max(0, ts_ms - self.last_ts_ms)
        self.last_ts_ms = ts_ms
        decay = math.exp(-self._decay_k * dt)
        # Load > 0.4 accumulates fatigue; load < 0.4 allows recovery
        contribution = (load_score - 0.4) * (dt / 1000.0) * 0.008
        self.index = float(np.clip(self.index * decay + contribution, 0.0, 1.0))
        return self.index


# ---------------------------------------------------------------------------
# Improved heuristic
# ---------------------------------------------------------------------------

def _sigmoid(x: float, center: float = 0.0, slope: float = 2.0) -> float:
    return 1.0 / (1.0 + math.exp(-slope * (x - center)))


def _improved_heuristic(
    features: np.ndarray,
    session_norm: np.ndarray,
    session_is_warm: bool,
) -> float:
    """
    Multi-factor heuristic grounded in cognitive load literature.

    Feature weights from meta-analysis of behavioural proxy studies:
      error_rate          0.30  Tsang & Velazquez (1996)
      pause_duration      0.22  Card, Moran & Newell (1983)
      mouse_acceleration  0.18  Zimmermann et al. (2011)
      tab_switches        0.14  Rubinstein, Meyer & Evans (2001)
      keystroke_iki       0.09  Vizer, Toth & Gergely (2009)
      copy_paste          0.07  (knowledge-gap proxy, domain knowledge)
    """
    er, pause, ma, tabs, iki, cp = (
        float(features[5]), float(features[7]), float(features[2]),
        float(features[6]), float(features[0]), float(features[8]),
    )

    if session_is_warm:
        z = np.clip(session_norm, -3.0, 3.0)
        load = (
            0.30 * _sigmoid(float(z[5]), center=0.5)
            + 0.22 * _sigmoid(float(z[7]), center=0.5)
            + 0.18 * _sigmoid(float(z[2]), center=0.5)
            + 0.14 * _sigmoid(float(z[6]), center=0.3)
            + 0.09 * _sigmoid(float(z[0]), center=0.3)
            + 0.07 * _sigmoid(float(z[8]), center=0.4)
        )
    else:
        # Absolute thresholds before session baseline is warm
        load = (
            0.30 * min(er * 4.0, 1.0)
            + 0.22 * min(pause / 8000.0, 1.0)
            + 0.18 * min(ma * 2.0, 1.0)
            + 0.14 * min(tabs * 0.3, 1.0)
            + 0.09 * min(iki / 1000.0, 1.0)
            + 0.07 * min(cp * 0.5, 1.0)
        )

    return float(np.clip(load, 0.0, 1.0))


# ---------------------------------------------------------------------------
# Main inferencer
# ---------------------------------------------------------------------------

class CognitiveLoadInferencer:
    """
    Per-session cognitive load inferencer.

    One instance per WebSocket session.  All state is in-memory; no shared
    mutable globals between sessions.

    Usage
    -----
        inferencer = CognitiveLoadInferencer()
        estimate = inferencer.push_signal(signal)
        # Returns None until 5+ windows have accumulated, then a rich
        # CognitiveLoadEstimate on every call.
    """

    SPIKE_THRESHOLD = 0.25  # |raw - kalman_pred| > this → is_anomaly

    def __init__(self) -> None:
        self.session_window: deque[BehavioralSignal] = deque()
        self.feature_history: deque[np.ndarray] = deque(maxlen=SEQ_LEN)
        self.window_ms = settings.SIGNAL_WINDOW_MS

        self.kalman   = KalmanFilter1D(q=0.002, r=0.05)
        self.baseline = SessionBaseline()
        self.fatigue  = FatigueTracker()

        self._load_history: deque[float] = deque(maxlen=600)  # ~60 s of history

        # Global scaler stats (overridden after NASA-TLX calibration)
        model_dir = Path(settings.MODEL_PATH).parent
        mean_path = model_dir / "scaler_mean.npy"
        std_path  = model_dir / "scaler_std.npy"

        self.global_means: np.ndarray = (
            np.load(mean_path).astype(np.float64) if mean_path.exists()
            else np.zeros(N_FEATURES, dtype=np.float64)
        )
        self.global_stds: np.ndarray = (
            np.load(std_path).astype(np.float64) if std_path.exists()
            else np.ones(N_FEATURES, dtype=np.float64)
        )

        self.onnx_session = None
        self.model_type = "heuristic"
        self._load_onnx()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def push_signal(self, signal: BehavioralSignal) -> Optional[CognitiveLoadEstimate]:
        self.session_window.append(signal)
        cutoff = signal.timestamp_ms - self.window_ms
        while self.session_window and self.session_window[0].timestamp_ms < cutoff:
            self.session_window.popleft()
        if len(self.session_window) < 5:
            return None

        features     = self._extract_features()
        self.baseline.update(features)
        session_norm = self.baseline.normalise(features)

        global_norm = (features - self.global_means) / (self.global_stds + 1e-8)
        self.feature_history.append(global_norm.astype(np.float32))

        raw_load  = self._estimate_load(features, session_norm)
        predicted = self.kalman.predict()
        smoothed  = self.kalman.update(raw_load)

        is_anomaly  = abs(raw_load - predicted) > self.SPIKE_THRESHOLD
        confidence  = self.baseline.mahalanobis_confidence(features)
        if self.model_type == "onnx":
            confidence = min(confidence + 0.15, 1.0)

        fatigue_index   = self.fatigue.update(smoothed, signal.timestamp_ms)
        self._load_history.append(smoothed)
        session_pct     = self._percentile(smoothed)
        dominant_idx    = int(np.argmax(np.abs(session_norm)))

        return CognitiveLoadEstimate(
            load_score=round(smoothed, 4),
            raw_load=round(raw_load, 4),
            confidence=round(confidence, 3),
            dominant_signal=FEATURE_NAMES[dominant_idx],
            window_size_ms=self.window_ms,
            model_type=self.model_type,
            fatigue_index=round(fatigue_index, 4),
            is_anomaly=is_anomaly,
            predicted_load=round(predicted, 4),
            session_percentile=round(session_pct, 3),
        )

    def update_calibration(self, means: np.ndarray, stds: np.ndarray) -> None:
        """Apply per-user calibration stats from the NASA-TLX protocol."""
        self.global_means = means.astype(np.float64)
        self.global_stds  = stds.astype(np.float64)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _load_onnx(self) -> None:
        model_path = Path(settings.MODEL_PATH)
        if not model_path.exists():
            logger.info("[NeuroFlow] No ONNX model at %s — using heuristic", model_path)
            return
        try:
            import onnxruntime as ort
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 2
            self.onnx_session = ort.InferenceSession(
                str(model_path),
                sess_options=opts,
                providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
            )
            self.model_type = "onnx"
            logger.info("[NeuroFlow] ONNX model loaded from %s", model_path)
        except Exception as exc:
            logger.warning("[NeuroFlow] ONNX load failed (%s) — heuristic active", exc)

    def _extract_features(self) -> np.ndarray:
        signals   = list(self.session_window)
        ikis      = [s.keystroke_iki_ms for s in signals if s.keystroke_iki_ms]
        velocities = [s.mouse_velocity for s in signals]
        return np.array([
            float(np.nanmean(ikis)) if ikis else 300.0,
            float(np.mean(velocities)) if velocities else 0.0,
            float(np.std(velocities))  if len(velocities) > 1 else 0.0,
            float(sum(s.mouse_direction_changes for s in signals)),
            float(np.mean([s.scroll_velocity for s in signals])),
            float(np.mean([s.error_rate for s in signals])),
            float(sum(s.tab_switches for s in signals)),
            float(max(s.pause_duration_ms for s in signals)),
            float(sum(s.copy_paste_count for s in signals)),
        ], dtype=np.float64)

    def _estimate_load(
        self,
        features: np.ndarray,
        session_norm: np.ndarray,
    ) -> float:
        if self.onnx_session is not None and len(self.feature_history) >= SEQ_LEN:
            seq = np.array(list(self.feature_history), dtype=np.float32)
            seq = seq.reshape(1, SEQ_LEN, N_FEATURES)
            name   = self.onnx_session.get_inputs()[0].name
            output = self.onnx_session.run(None, {name: seq})
            return float(np.clip(output[0][0], 0.0, 1.0))
        return _improved_heuristic(features, session_norm, self.baseline.is_warm)

    def _percentile(self, value: float) -> float:
        if not self._load_history:
            return 0.5
        arr = list(self._load_history)
        return sum(1 for v in arr if v <= value) / len(arr)
