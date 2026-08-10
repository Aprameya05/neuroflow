"""
Tests for the cognitive load inference engine.
Run: pytest backend/tests/ -v
"""
import pytest
import numpy as np
from app.ml.inference import CognitiveLoadInferencer, BehavioralSignal, FEATURE_NAMES


def make_signal(ts: int, er: float = 0.1, pause: float = 500.0) -> BehavioralSignal:
    return BehavioralSignal(
        timestamp_ms=ts,
        keystroke_iki_ms=200.0,
        mouse_velocity=0.3,
        mouse_acceleration=0.05,
        mouse_direction_changes=2,
        scroll_velocity=0.02,
        error_rate=er,
        tab_switches=0,
        pause_duration_ms=pause,
        copy_paste_count=0,
    )


class TestCognitiveLoadInferencer:
    def test_returns_none_before_enough_signals(self):
        inf = CognitiveLoadInferencer()
        signal = make_signal(ts=1000)
        result = inf.push_signal(signal)
        assert result is None

    def test_returns_estimate_after_enough_signals(self):
        inf = CognitiveLoadInferencer()
        for i in range(10):
            result = inf.push_signal(make_signal(ts=1000 + i * 100))
        assert result is not None
        assert 0.0 <= result.load_score <= 1.0
        assert 0.0 <= result.confidence <= 1.0
        assert result.dominant_signal in FEATURE_NAMES or result.dominant_signal == "stub_heuristic"

    def test_high_error_rate_increases_load(self):
        inf_low = CognitiveLoadInferencer()
        inf_high = CognitiveLoadInferencer()

        for i in range(15):
            inf_low.push_signal(make_signal(ts=1000 + i * 100, er=0.0, pause=100))
            result_low = inf_low.push_signal(make_signal(ts=1000 + i * 100 + 50, er=0.0, pause=100))

        for i in range(15):
            inf_high.push_signal(make_signal(ts=1000 + i * 100, er=0.9, pause=8000))
            result_high = inf_high.push_signal(make_signal(ts=1000 + i * 100 + 50, er=0.9, pause=8000))

        if result_low and result_high:
            assert result_high.load_score >= result_low.load_score

    def test_sliding_window_drops_old_signals(self):
        inf = CognitiveLoadInferencer()
        # Send signals spanning more than the window
        for i in range(50):
            inf.push_signal(make_signal(ts=i * 200))
        # Window should only contain recent signals
        assert len(inf.session_window) < 50

    def test_calibration_update(self):
        inf = CognitiveLoadInferencer()
        means = np.zeros(len(FEATURE_NAMES))
        stds = np.ones(len(FEATURE_NAMES))
        inf.update_calibration(means, stds)
        assert np.allclose(inf.feature_means, means)
        assert np.allclose(inf.feature_stds, stds)

    def test_feature_names_count(self):
        assert len(FEATURE_NAMES) == 9


class TestCalibrationService:
    def test_needs_minimum_sessions(self):
        from app.services.calibration_service import CalibrationService
        svc = CalibrationService()
        sessions = [{"behavioral_features": {}, "nasa_tlx_score": 50}] * 5
        result = svc.compute_normalization(sessions)
        assert result is None  # needs 10+

    def test_computes_normalization_with_enough_sessions(self):
        from app.services.calibration_service import CalibrationService, FEATURE_NAMES
        svc = CalibrationService()
        sessions = []
        for i in range(12):
            sessions.append({
                "behavioral_features": {f: float(i) for f in FEATURE_NAMES},
                "nasa_tlx_score": float(i * 8),
                "user_id": "test",
                "task_type": "nback_2",
                "difficulty": 2,
            })
        result = svc.compute_normalization(sessions)
        assert result is not None
        assert set(result.keys()) == set(FEATURE_NAMES)
        for feat in FEATURE_NAMES:
            assert "mean" in result[feat]
            assert "std" in result[feat]
