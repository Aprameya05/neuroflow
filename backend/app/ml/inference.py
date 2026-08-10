"""
Real-time cognitive load inference.

Two modes:
  1. ONNX model (production) -- loads when cognitive_load_lstm.onnx exists
  2. Heuristic stub (development) -- used before model is trained

The model expects a sequence of SEQ_LEN=30 feature windows, each 9-dimensional.
The scaler stats (mean/std) from training are used for normalization.
"""
import numpy as np
from dataclasses import dataclass
from collections import deque
from typing import Optional
from pathlib import Path
from app.core.config import settings


FEATURE_NAMES = [
    "keystroke_iki_ms",
    "mouse_velocity",
    "mouse_acceleration",
    "mouse_direction_changes",
    "scroll_velocity",
    "error_rate",
    "tab_switches",
    "pause_duration_ms",
    "copy_paste_count",
]

SEQ_LEN = 30   # must match training config


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
    load_score: float
    confidence: float
    dominant_signal: str
    window_size_ms: int
    model_type: str   # "onnx" | "heuristic"


class CognitiveLoadInferencer:
    def __init__(self):
        self.session_window: deque[BehavioralSignal] = deque()
        self.feature_history: deque[np.ndarray] = deque(maxlen=SEQ_LEN)
        self.window_ms = settings.SIGNAL_WINDOW_MS

        # Load scaler stats if available
        model_dir = Path(settings.MODEL_PATH).parent
        mean_path = model_dir / "scaler_mean.npy"
        std_path = model_dir / "scaler_std.npy"

        if mean_path.exists() and std_path.exists():
            self.feature_means = np.load(mean_path)
            self.feature_stds = np.load(std_path)
        else:
            self.feature_means = np.zeros(len(FEATURE_NAMES), dtype=np.float32)
            self.feature_stds = np.ones(len(FEATURE_NAMES), dtype=np.float32)

        # Load ONNX model if available
        self.session = None
        self.model_type = "heuristic"
        self._load_model()

    def _load_model(self):
        model_path = Path(settings.MODEL_PATH)
        if not model_path.exists():
            print(f"[NeuroFlow] No ONNX model at {model_path} -- using heuristic stub")
            return
        try:
            import onnxruntime as ort
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 2
            self.session = ort.InferenceSession(
                str(model_path),
                sess_options=opts,
                providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
            )
            self.model_type = "onnx"
            print(f"[NeuroFlow] ONNX model loaded from {model_path}")
        except Exception as e:
            print(f"[NeuroFlow] Failed to load ONNX model: {e} -- using heuristic stub")

    def push_signal(self, signal: BehavioralSignal) -> Optional[CognitiveLoadEstimate]:
        self.session_window.append(signal)

        # Drop signals outside sliding window
        cutoff = signal.timestamp_ms - self.window_ms
        while self.session_window and self.session_window[0].timestamp_ms < cutoff:
            self.session_window.popleft()

        if len(self.session_window) < 5:
            return None

        features = self._extract_features()
        normalized = (features - self.feature_means) / (self.feature_stds + 1e-8)
        self.feature_history.append(normalized)

        return self._run_inference(features, normalized)

    def _extract_features(self) -> np.ndarray:
        signals = list(self.session_window)
        ikis = [s.keystroke_iki_ms for s in signals if s.keystroke_iki_ms]
        return np.array([
            float(np.nanmean(ikis)) if ikis else 300.0,
            float(np.mean([s.mouse_velocity for s in signals])),
            float(np.std([s.mouse_velocity for s in signals])),
            float(sum(s.mouse_direction_changes for s in signals)),
            float(np.mean([s.scroll_velocity for s in signals])),
            float(np.mean([s.error_rate for s in signals])),
            float(sum(s.tab_switches for s in signals)),
            float(max(s.pause_duration_ms for s in signals)),
            float(sum(s.copy_paste_count for s in signals)),
        ], dtype=np.float32)

    def _run_inference(
        self, raw_features: np.ndarray, normalized: np.ndarray
    ) -> CognitiveLoadEstimate:
        dominant_idx = int(np.argmax(np.abs(normalized)))

        if self.session is None or len(self.feature_history) < SEQ_LEN:
            # Heuristic: weighted combination of most predictive signals
            load = float(np.clip(
                0.3 * min(raw_features[5] * 4, 1.0)      # error_rate
                + 0.25 * min(raw_features[7] / 8000, 1.0) # pause_duration
                + 0.2 * min(raw_features[6] * 0.3, 1.0)   # tab_switches
                + 0.15 * min(raw_features[2] * 2, 1.0)    # mouse_acceleration
                + 0.1 * np.random.normal(0, 0.02),         # small noise
                0.0, 1.0
            ))
            return CognitiveLoadEstimate(
                load_score=round(load, 3),
                confidence=0.4,
                dominant_signal=FEATURE_NAMES[dominant_idx],
                window_size_ms=self.window_ms,
                model_type="heuristic",
            )

        # ONNX inference
        sequence = np.array(list(self.feature_history), dtype=np.float32)
        sequence = sequence.reshape(1, SEQ_LEN, len(FEATURE_NAMES))

        input_name = self.session.get_inputs()[0].name
        outputs = self.session.run(None, {input_name: sequence})
        load_score = float(np.clip(outputs[0][0], 0.0, 1.0))

        return CognitiveLoadEstimate(
            load_score=round(load_score, 3),
            confidence=0.85,
            dominant_signal=FEATURE_NAMES[dominant_idx],
            window_size_ms=self.window_ms,
            model_type="onnx",
        )

    def update_calibration(self, means: np.ndarray, stds: np.ndarray):
        self.feature_means = means.astype(np.float32)
        self.feature_stds = stds.astype(np.float32)
