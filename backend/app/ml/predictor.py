"""
NeuroFlow Load Forecaster — 60-second-ahead prediction.

Uses a Holt-Winters exponential smoothing state-space model (additive
trend, no seasonality) to forecast cognitive load 60 steps (6 seconds)
ahead.  Each step corresponds to one 100 ms inference window.

Also provides:
  * Intervention detection  — detects when the load trajectory changes
    direction significantly (useful for triggering UI state pre-adaptation)
  * Confidence intervals    — 80 % and 95 % bands around the forecast
  * Load phase classifier   — maps current trajectory to one of:
      "rising"  | "falling" | "stable" | "volatile"
"""
from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

import numpy as np


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class ForecastResult:
    forecast: list[float]          # N forecast values (clipped to [0, 1])
    horizon_steps: int             # how many steps ahead
    ci_80_lower: list[float]       # 80 % confidence lower band
    ci_80_upper: list[float]
    ci_95_lower: list[float]       # 95 % confidence lower band
    ci_95_upper: list[float]
    phase: str                     # "rising" | "falling" | "stable" | "volatile"
    intervention_detected: bool    # significant trajectory change
    trend: float                   # current slope (load units per step)


# ---------------------------------------------------------------------------
# Holt-Winters additive (alpha + beta) — no seasonality
# ---------------------------------------------------------------------------

class HoltWintersForecaster:
    """
    Double exponential smoothing (Holt's linear method).

    Level  l_t = alpha * y_t + (1 - alpha) * (l_{t-1} + b_{t-1})
    Trend  b_t = beta  * (l_t - l_{t-1}) + (1 - beta) * b_{t-1}

    Parameters
    ----------
    alpha : float
        Level smoothing factor.  Higher = more reactive to recent load.
    beta : float
        Trend smoothing factor.  Higher = more reactive to direction changes.
    sigma_init : float
        Initial residual standard deviation (for confidence intervals).
    """

    MIN_HISTORY = 10  # steps before we trust the forecast

    def __init__(
        self,
        alpha: float = 0.25,
        beta: float  = 0.08,
        sigma_init: float = 0.05,
    ) -> None:
        self.alpha = alpha
        self.beta  = beta

        self.level: Optional[float] = None
        self.trend: float = 0.0
        self.n_obs: int   = 0

        # Rolling residual tracking for confidence intervals
        self._residuals: deque[float] = deque(maxlen=200)
        self._sigma = sigma_init

        # For intervention detection
        self._prev_trend: float = 0.0
        self._trend_history: deque[float] = deque(maxlen=30)

    def update(self, observation: float) -> None:
        """Incorporate a new load observation."""
        if self.level is None:
            self.level = observation
            self.trend = 0.0
        else:
            prev_level = self.level
            self.level = self.alpha * observation + (1 - self.alpha) * (self.level + self.trend)
            self.trend = (
                self.beta * (self.level - prev_level)
                + (1 - self.beta) * self.trend
            )
            residual = abs(observation - (prev_level + self.trend))
            self._residuals.append(residual)
            if len(self._residuals) >= 5:
                self._sigma = float(np.std(self._residuals))

        self._trend_history.append(self.trend)
        self.n_obs += 1

    def forecast(self, horizon: int = 60) -> Optional[ForecastResult]:
        """
        Produce a h-step-ahead forecast.

        Returns None if fewer than MIN_HISTORY observations have been
        incorporated (not enough data to trust the model).
        """
        if self.level is None or self.n_obs < self.MIN_HISTORY:
            return None

        l, b = self.level, self.trend
        # Point forecasts
        points = [float(np.clip(l + (h + 1) * b, 0.0, 1.0)) for h in range(horizon)]

        # Confidence intervals using cumulative variance
        # Variance grows with horizon: Var(h) ≈ sigma^2 * h * alpha^2 / (1-alpha)^2
        # Simplified: linear variance growth
        sigma = self._sigma if self._sigma > 0 else 0.03
        z80 = 1.282
        z95 = 1.960
        ci80_lo, ci80_hi, ci95_lo, ci95_hi = [], [], [], []
        for h in range(horizon):
            se = sigma * math.sqrt(1 + (h + 1) * self.alpha ** 2)
            ci80_lo.append(float(np.clip(points[h] - z80 * se, 0.0, 1.0)))
            ci80_hi.append(float(np.clip(points[h] + z80 * se, 0.0, 1.0)))
            ci95_lo.append(float(np.clip(points[h] - z95 * se, 0.0, 1.0)))
            ci95_hi.append(float(np.clip(points[h] + z95 * se, 0.0, 1.0)))

        # Phase classification
        phase = self._classify_phase()

        # Intervention: trend changed direction significantly in last 5 steps
        intervention = self._detect_intervention()

        return ForecastResult(
            forecast=points,
            horizon_steps=horizon,
            ci_80_lower=ci80_lo,
            ci_80_upper=ci80_hi,
            ci_95_lower=ci95_lo,
            ci_95_upper=ci95_hi,
            phase=phase,
            intervention_detected=intervention,
            trend=round(self.trend, 5),
        )

    def _classify_phase(self) -> str:
        if len(self._trend_history) < 5:
            return "stable"
        recent = list(self._trend_history)[-10:]
        mean_trend  = float(np.mean(recent))
        trend_std   = float(np.std(recent))
        if trend_std > 0.012:
            return "volatile"
        if mean_trend > 0.005:
            return "rising"
        if mean_trend < -0.005:
            return "falling"
        return "stable"

    def _detect_intervention(self) -> bool:
        """True when the trend has reversed significantly in the last 5 steps."""
        if len(self._trend_history) < 10:
            return False
        hist = list(self._trend_history)
        prev_mean = float(np.mean(hist[-10:-5]))
        curr_mean = float(np.mean(hist[-5:]))
        return abs(curr_mean - prev_mean) > 0.015


# ---------------------------------------------------------------------------
# High-level SessionForecaster (wraps HoltWinters, adds windowed context)
# ---------------------------------------------------------------------------

class SessionForecaster:
    """
    Attaches to a session and maintains a rolling forecast.

    Usage
    -----
        forecaster = SessionForecaster(horizon_steps=60)
        forecaster.push(load_score)          # call after every estimate
        result = forecaster.latest_forecast  # ForecastResult or None
    """

    def __init__(self, horizon_steps: int = 60) -> None:
        self.horizon = horizon_steps
        self._model  = HoltWintersForecaster(alpha=0.25, beta=0.08)
        self._result: Optional[ForecastResult] = None

    def push(self, load_score: float) -> Optional[ForecastResult]:
        """Ingest a new smoothed load score and update the forecast."""
        self._model.update(load_score)
        self._result = self._model.forecast(self.horizon)
        return self._result

    @property
    def latest_forecast(self) -> Optional[ForecastResult]:
        return self._result

    def forecast_at_seconds(self, seconds: float) -> Optional[float]:
        """
        Return the point forecast for a given number of seconds ahead.
        Assumes 100 ms per step (10 steps/s).
        """
        if self._result is None:
            return None
        step = int(seconds * 10)
        if step < len(self._result.forecast):
            return self._result.forecast[step]
        return None
