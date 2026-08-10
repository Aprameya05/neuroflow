"""
Real-time cognitive load inference.
Runs the ONNX-exported LSTM model on a sliding window of behavioral signals.

Before the model is trained, falls back to a heuristic stub so the rest
of the system can be developed and tested end-to-end.
"""
import numpy as np
from dataclasses import dataclass
from collections import deque
from typing import Optional
from app.core.config import settings


FEATURE_NAMES = [
    "keystroke_iki_ms",       # Average inter-keystroke interval (ms)
    "mouse_velocity",         # Average mouse speed (px/ms)
    "mouse_acceleration",     # Std-dev of mouse speed (jerkiness)
    "mouse_direction_changes",# Count of direction reversals per window
    "scroll_velocity",        # Average scroll speed (px/ms)
    "error_rate",             # Backspaces / total keypresses
    "tab_switches",           # Tab/window switches per window
    "pause_duration_ms",      # Longest continuous pause in window
    "copy_paste_count",       # Copy + paste events per window
]


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
    load_score: float       # 0.0 = low load (in flow) | 1.0 = high load (overwhelmed)
    confidence: float       # model confidence [0, 1]
    dominant_signal: str    # feature name that most influenced this estimate
    window_size_ms: int


class CognitiveLoadInferencer:
    """
    Per-session inferencer. One instance per WebSocket connection.

    Usage:
        inferencer = CognitiveLoadInferencer()
        estimate = inferencer.push_signal(signal)  # returns None until enough history
    """

    def __init__(self):
        self._load_model()
        self.window: deque[BehavioralSignal] = deque()
        self.window_ms = settings.SIGNAL_WINDOW_MS
        # Per-user z-score normalization — updated by calibration endpoint
        self.feature_means = np.zeros(len(FEATURE_NAMES), dtype=np.float32)
        self.feature_stds = np.ones(len(FEATURE_NAMES), dtype=np.float32)

    def _load_model(self):
        try:
            import onnxruntime as ort
            self.session = ort.InferenceSession(settings.MODEL_PATH)
        except Exception:
            self.session = None  # Heuristic stub until model trained

    def push_signal(self, signal: BehavioralSignal) -> Optional[CognitiveLoadEstimate]:
        self.window.append(signal)
        cutoff = signal.timestamp_ms - self.window_ms
        while self.window and self.window[0].timestamp_ms < cutoff:
            self.window.popleft()

        if len(self.window) < 5:
            return None  # Need minimum signal history

        features = self._extract_features()
        return self._run_inference(features)

    def _extract_features(self) -> np.ndarray:
        signals = list(self.window)
        ikis = [s.keystroke_iki_ms for s in signals if s.keystroke_iki_ms]
        agg = {
            "keystroke_iki_ms": float(np.nanmean(ikis)) if ikis else 300.0,
            "mouse_velocity": float(np.mean([s.mouse_velocity for s in signals])),
            "mouse_acceleration": float(np.std([s.mouse_velocity for s in signals])),
            "mouse_direction_changes": float(sum(s.mouse_direction_changes for s in signals)),
            "scroll_velocity": float(np.mean([s.scroll_velocity for s in signals])),
            "error_rate": float(np.mean([s.error_rate for s in signals])),
            "tab_switches": float(sum(s.tab_switches for s in signals)),
            "pause_duration_ms": float(max(s.pause_duration_ms for s in signals)),
            "copy_paste_count": float(sum(s.copy_paste_count for s in signals)),
        }
        raw = np.array([agg[f] for f in FEATURE_NAMES], dtype=np.float32)
        return (raw - self.feature_means) / (self.feature_stds + 1e-8)

    def _run_inference(self, features: np.ndarray) -> CognitiveLoadEstimate:
        dominant_idx = int(np.argmax(np.abs(features)))

        if self.session is None:
            # Heuristic stub: high error rate + long pauses = high load
            raw = features * self.feature_stds + self.feature_means
            load = float(np.clip(
                (raw[5] * 3.0) + (raw[7] / 10000.0) + (raw[6] * 0.1), 0, 1
            ))
            return CognitiveLoadEstimate(
                load_score=round(load, 3),
                confidence=0.4,
                dominant_signal=FEATURE_NAMES[dominant_idx],
                window_size_ms=self.window_ms,
            )

        input_name = self.session.get_inputs()[0].name
        output = self.session.run(None, {input_name: features.reshape(1, 1, -1)})
        load_score = float(np.clip(output[0][0][0], 0.0, 1.0))
        confidence = float(output[1][0][0]) if len(output) > 1 else 0.85

        return CognitiveLoadEstimate(
            load_score=round(load_score, 3),
            confidence=round(confidence, 3),
            dominant_signal=FEATURE_NAMES[dominant_idx],
            window_size_ms=self.window_ms,
        )

    def update_calibration(self, means: np.ndarray, stds: np.ndarray):
        """
        Update per-user feature normalization after a calibration session.
        Called by the calibration API endpoint.
        """
        self.feature_means = means.astype(np.float32)
        self.feature_stds = stds.astype(np.float32)
