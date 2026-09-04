"""
Real-time cognitive load inference — NeuroFlow v2.

Three-layer inference stack:
  1.  Feature extraction   — 9 behavioural signals → normalised feature vector
  2.  Load estimation      — ONNX BiLSTM (prod) or improved heuristic (dev)
  3.  Post-processing      — Kalman filter, adaptive baseline, fatigue integral,
                             Mahalanobis confidence, anomaly detection,
                             circadian normalisation, flow episode detection

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
* Circadian normalisation: load baseline adjusts for time-of-day. Peak cognitive
  capacity at ~10 am, trough at ~3 pm (inverted-U diurnal model).
* Flow episode detection: tracks contiguous low-load windows as discrete labelled
  flow episodes with depth, duration, and recovery-speed metrics.
"""
from __future__ import annotations

import math
import logging
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
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

# Flow episode thresholds
FLOW_ENTRY_THRESHOLD  = 0.32   # load must drop below this to enter flow
FLOW_EXIT_THRESHOLD   = 0.42   # load must rise above this to exit flow (hysteresis)
FLOW_MIN_WINDOWS      = 8      # minimum consecutive windows to constitute a flow episode


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
class FlowEpisode:
    start_ts: int
    end_ts: int
    avg_depth: float         # mean (1 - load_score) during the episode — higher = deeper flow
    min_load: float          # lowest load observed in the episode
    duration_ms: int
    window_count: int
    recovery_load: float     # average load in the 5 windows immediately after exit


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
    # v2.1 additions
    circadian_factor: float    # 0.7–1.15 time-of-day capacity multiplier
    in_flow_episode: bool      # currently in a detected flow state
    flow_episode_depth: float  # 0.0 if not in flow; avg depth of current episode so far


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
# Circadian normaliser
# ---------------------------------------------------------------------------

class CircadianNormalizer:
    """
    Time-of-day aware cognitive capacity model.

    Uses an inverted-U sinusoidal model of diurnal cognitive capacity
    (Monk et al., 1983; Folkard & Monk, 1985):
      - Capacity rises from ~7 am, peaks at ~10 am
      - Dips slightly post-lunch (~2 pm)
      - Secondary minor peak ~4–5 pm
      - Falls steeply after 7 pm

    The factor returned is a multiplier in [0.70, 1.15] applied to the
    effective load: high capacity hours reduce effective load slightly
    (the user can handle more), low capacity hours amplify it.

    Implementation: dual-cosine model fitted to the empirical data in
    Monk et al. (1983), Table 2, normalised to unit amplitude.
    """

    # Peak cognitive performance hour (10 am local)
    _PEAK_HOUR: float = 10.0
    # Secondary minor peak (4 pm local) — post-lunch recovery
    _SECONDARY_HOUR: float = 16.0
    # Post-lunch trough depth relative to primary amplitude
    _SECONDARY_AMPLITUDE: float = 0.18

    def factor(self, ts_ms: Optional[int] = None) -> float:
        """
        Return a circadian capacity factor for the given UTC timestamp.
        Factor > 1.0 means the user is in a high-capacity period (load feels lighter).
        Factor < 1.0 means the user is in a low-capacity period (load feels heavier).
        """
        if ts_ms is None:
            ts_ms = int(time.time() * 1000)

        dt_utc = datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc)
        hour_frac = dt_utc.hour + dt_utc.minute / 60.0

        # Primary cosine: peaks at _PEAK_HOUR, period 24 h, amplitude 0.20
        primary = 0.20 * math.cos(2 * math.pi * (hour_frac - self._PEAK_HOUR) / 24.0)

        # Secondary cosine: mild afternoon recovery peak
        secondary = self._SECONDARY_AMPLITUDE * math.cos(
            2 * math.pi * (hour_frac - self._SECONDARY_HOUR) / 12.0
        )

        # Combined factor: centre 1.0, range ~[0.70, 1.15]
        factor = 1.0 + primary + secondary * 0.3
        return float(np.clip(factor, 0.70, 1.15))

    def normalise_load(self, raw_load: float, ts_ms: Optional[int] = None) -> float:
        """
        Adjust raw load by circadian factor.
        High-capacity periods compress load toward 0; low-capacity periods amplify it.
        """
        f = self.factor(ts_ms)
        # When capacity is high (f > 1), divide load → lower effective load
        # When capacity is low  (f < 1), divide load → higher effective load
        adjusted = raw_load / f
        return float(np.clip(adjusted, 0.0, 1.0))


# ---------------------------------------------------------------------------
# Flow episode detector
# ---------------------------------------------------------------------------

class FlowEpisodeDetector:
    """
    Detects discrete flow episodes from the Kalman-smoothed load stream.

    A flow episode is a contiguous run of FLOW_MIN_WINDOWS or more
    windows where load stays below FLOW_ENTRY_THRESHOLD.  Hysteresis
    prevents rapid in/out toggling: once inside a flow episode, load must
    rise above FLOW_EXIT_THRESHOLD to end it.

    The recovery window (5 windows post-exit) is captured to measure how
    fast the user re-enters a demanding state after flow breaks.
    """

    def __init__(self) -> None:
        self._in_flow: bool = False
        self._flow_start_ts: int = 0
        self._flow_loads: list[float] = []
        self._flow_tss: list[int] = []
        self._post_flow_buffer: deque[float] = deque(maxlen=5)
        self._pending_episode: Optional[dict] = None

        self.completed_episodes: list[FlowEpisode] = []

    @property
    def in_flow(self) -> bool:
        return self._in_flow and len(self._flow_loads) >= FLOW_MIN_WINDOWS

    @property
    def current_depth(self) -> float:
        if not self._in_flow or not self._flow_loads:
            return 0.0
        return round(1.0 - float(np.mean(self._flow_loads)), 4)

    def update(self, load: float, ts_ms: int) -> None:
        if self._pending_episode is not None:
            # Collecting post-flow recovery windows
            self._post_flow_buffer.append(load)
            if len(self._post_flow_buffer) == self._post_flow_buffer.maxlen:
                ep = self._pending_episode
                recovery_load = float(np.mean(self._post_flow_buffer))
                loads_arr = ep["loads"]
                episode = FlowEpisode(
                    start_ts=ep["start_ts"],
                    end_ts=ep["end_ts"],
                    avg_depth=round(1.0 - float(np.mean(loads_arr)), 4),
                    min_load=round(float(np.min(loads_arr)), 4),
                    duration_ms=ep["end_ts"] - ep["start_ts"],
                    window_count=len(loads_arr),
                    recovery_load=round(recovery_load, 4),
                )
                self.completed_episodes.append(episode)
                self._pending_episode = None

        if not self._in_flow:
            if load < FLOW_ENTRY_THRESHOLD:
                self._in_flow = True
                self._flow_start_ts = ts_ms
                self._flow_loads = [load]
                self._flow_tss = [ts_ms]
        else:
            if load > FLOW_EXIT_THRESHOLD:
                # Exit flow
                if len(self._flow_loads) >= FLOW_MIN_WINDOWS:
                    self._pending_episode = {
                        "start_ts": self._flow_start_ts,
                        "end_ts": self._flow_tss[-1],
                        "loads": list(self._flow_loads),
                    }
                    self._post_flow_buffer.clear()
                self._in_flow = False
                self._flow_loads = []
                self._flow_tss = []
            else:
                self._flow_loads.append(load)
                self._flow_tss.append(ts_ms)


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

        self.kalman    = KalmanFilter1D(q=0.002, r=0.05)
        self.baseline  = SessionBaseline()
        self.fatigue   = FatigueTracker()
        self.circadian = CircadianNormalizer()
        self.flow      = FlowEpisodeDetector()

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

        # Circadian adjustment: same underlying load feels different depending
        # on what time of day it is.
        circadian_factor = self.circadian.factor(signal.timestamp_ms)
        circadian_load   = self.circadian.normalise_load(raw_load, signal.timestamp_ms)

        predicted = self.kalman.predict()
        smoothed  = self.kalman.update(circadian_load)

        is_anomaly  = abs(circadian_load - predicted) > self.SPIKE_THRESHOLD
        confidence  = self.baseline.mahalanobis_confidence(features)
        if self.model_type == "onnx":
            confidence = min(confidence + 0.15, 1.0)

        fatigue_index = self.fatigue.update(smoothed, signal.timestamp_ms)
        self._load_history.append(smoothed)
        session_pct   = self._percentile(smoothed)
        dominant_idx  = int(np.argmax(np.abs(session_norm)))

        # Flow episode tracking
        self.flow.update(smoothed, signal.timestamp_ms)
        in_flow      = self.flow.in_flow
        flow_depth   = self.flow.current_depth if in_flow else 0.0

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
            circadian_factor=round(circadian_factor, 4),
            in_flow_episode=in_flow,
            flow_episode_depth=round(flow_depth, 4),
        )

    def get_flow_episodes(self) -> list[FlowEpisode]:
        """Return all completed flow episodes detected so far this session."""
        return list(self.flow.completed_episodes)

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
        signals    = list(self.session_window)
        ikis       = [s.keystroke_iki_ms for s in signals if s.keystroke_iki_ms]
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
