"""
NeuroFlow Analytics API — session intelligence endpoints.

Endpoints
---------
GET  /api/analytics/sessions/{session_id}/summary
     Rich session summary: load distribution, flow index, fatigue trend,
     peak detection, dominant signals, session health score.

GET  /api/analytics/sessions/{session_id}/forecast
     Replay-based Holt-Winters forecast over the full session history.
     Returns the projected load for the next 60 s if the session were
     to continue at the same trajectory.

GET  /api/analytics/users/{user_id}/fingerprint
     Behavioural signature: per-signal mean/std across all of the user's
     sessions.  Useful for visualising the cognitive fingerprint radar.

GET  /api/analytics/sessions/{session_id}/peaks
     Detected overload peaks (load > 0.65 for ≥ 3 consecutive estimates).

GET  /api/analytics/compare
     Query params: session_a, session_b.  Returns side-by-side stats.

GET  /api/analytics/sessions/{session_id}/segments
     Chronological list of labelled cognitive segments: flow episodes
     (sustained low-load) and overload episodes (sustained high-load),
     with start/end timestamps, depth/intensity, and duration.

GET  /api/analytics/sessions/{session_id}/correlations
     Pearson r between each behavioural signal and the load score
     for the session.  Useful for ranking which signals were most
     predictive of load for this individual user.
"""
from __future__ import annotations

import math
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db import get_db
from app.db.models import LoadEstimateRecord, Session as SessionModel
from app.ml.predictor import HoltWintersForecaster
from app.ml.inference import (
    FLOW_ENTRY_THRESHOLD,
    FLOW_EXIT_THRESHOLD,
    FLOW_MIN_WINDOWS,
    FEATURE_NAMES,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _state_from_load(load: float) -> str:
    if load < 0.21:
        return "rich"
    if load < 0.35:
        return "normal"
    if load < 0.65:
        return "reduced"
    return "minimal"


def _flow_index(loads: list[float]) -> float:
    """
    Fraction of time in 'rich' or 'normal' state (load < 0.35),
    weighted by confidence that the user was engaged (non-zero activity).
    """
    if not loads:
        return 0.0
    in_flow = sum(1 for l in loads if l < 0.35)
    return round(in_flow / len(loads), 4)


def _detect_peaks(loads: list[float], ts: list[int], threshold: float = 0.65, min_run: int = 3):
    """
    Return list of overload episodes: (start_ts, end_ts, peak_load).
    An episode is a contiguous run of >= min_run estimates above threshold.
    """
    peaks = []
    i = 0
    while i < len(loads):
        if loads[i] >= threshold:
            j = i
            while j < len(loads) and loads[j] >= threshold:
                j += 1
            if j - i >= min_run:
                episode_loads = loads[i:j]
                peaks.append({
                    "start_ts": ts[i],
                    "end_ts": ts[j - 1],
                    "peak_load": round(max(episode_loads), 4),
                    "avg_load": round(sum(episode_loads) / len(episode_loads), 4),
                    "duration_ms": ts[j - 1] - ts[i],
                })
            i = j
        else:
            i += 1
    return peaks


def _health_score(
    flow_index: float,
    avg_load: float,
    volatility: float,
    peak_count: int,
) -> float:
    """
    Composite session health score (0–100).

    High flow, low average load, low volatility, few peaks → 100.
    Weights tuned heuristically to give intuitive output.
    """
    s = (
        40 * flow_index
        + 25 * (1 - avg_load)
        + 20 * max(0, 1 - volatility * 5)
        + 15 * max(0, 1 - peak_count * 0.1)
    )
    return round(float(min(max(s, 0), 100)), 1)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/sessions/{session_id}/summary")
async def session_summary(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Full cognitive session report — used by the post-session report card."""
    try:
        result = await db.execute(
            select(LoadEstimateRecord)
            .where(LoadEstimateRecord.session_id == session_id)
            .order_by(LoadEstimateRecord.ts.asc())
        )
        rows = result.scalars().all()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DB error: {exc}")

    if not rows:
        raise HTTPException(status_code=404, detail=f"No data for session {session_id}")

    loads = [r.load_score for r in rows]
    ts    = [r.ts for r in rows]

    avg_load    = sum(loads) / len(loads)
    peak_load   = max(loads)
    volatility  = float(math.sqrt(sum((l - avg_load) ** 2 for l in loads) / len(loads)))
    flow_idx    = _flow_index(loads)
    peaks       = _detect_peaks(loads, ts)
    duration_ms = ts[-1] - ts[0] if len(ts) > 1 else 0

    # State distribution
    state_counts: dict[str, int] = {"rich": 0, "normal": 0, "reduced": 0, "minimal": 0}
    for l in loads:
        state_counts[_state_from_load(l)] += 1
    state_pct = {s: round(c / len(loads), 4) for s, c in state_counts.items()}

    # Dominant signals across session
    signal_counts: dict[str, int] = {}
    for r in rows:
        sig = r.dominant_signal or "unknown"
        signal_counts[sig] = signal_counts.get(sig, 0) + 1
    dominant_signal = max(signal_counts, key=signal_counts.get) if signal_counts else "unknown"

    health = _health_score(flow_idx, avg_load, volatility, len(peaks))

    return {
        "session_id": session_id,
        "count": len(rows),
        "duration_ms": duration_ms,
        "avg_load": round(avg_load, 4),
        "peak_load": round(peak_load, 4),
        "volatility": round(volatility, 4),
        "flow_index": flow_idx,
        "health_score": health,
        "state_distribution": state_pct,
        "dominant_signal": dominant_signal,
        "signal_distribution": signal_counts,
        "peak_overload_episodes": peaks,
        "peak_count": len(peaks),
        "started_at": ts[0],
        "ended_at": ts[-1],
    }


@router.get("/sessions/{session_id}/forecast")
async def session_forecast(
    session_id: str,
    horizon_steps: int = Query(60, ge=1, le=300),
    db: AsyncSession = Depends(get_db),
):
    """
    Replay-based Holt-Winters forecast.

    Feeds the full session history into the forecaster, then returns the
    N-step-ahead projection.  Useful for showing "where you're headed"
    at session end.
    """
    try:
        result = await db.execute(
            select(LoadEstimateRecord)
            .where(LoadEstimateRecord.session_id == session_id)
            .order_by(LoadEstimateRecord.ts.asc())
        )
        rows = result.scalars().all()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DB error: {exc}")

    if not rows:
        raise HTTPException(status_code=404, detail=f"No data for session {session_id}")

    forecaster = HoltWintersForecaster(alpha=0.25, beta=0.08)
    for r in rows:
        forecaster.update(r.load_score)

    result_fc = forecaster.forecast(horizon_steps)
    if result_fc is None:
        raise HTTPException(status_code=422, detail="Not enough data to forecast (need ≥ 10 estimates).")

    return {
        "session_id": session_id,
        "horizon_steps": horizon_steps,
        "phase": result_fc.phase,
        "trend": result_fc.trend,
        "intervention_detected": result_fc.intervention_detected,
        "forecast": result_fc.forecast,
        "ci_80_lower": result_fc.ci_80_lower,
        "ci_80_upper": result_fc.ci_80_upper,
        "ci_95_lower": result_fc.ci_95_lower,
        "ci_95_upper": result_fc.ci_95_upper,
    }


@router.get("/sessions/{session_id}/peaks")
async def session_peaks(
    session_id: str,
    threshold: float = Query(0.65, ge=0.0, le=1.0),
    min_duration_ms: int = Query(3000, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Overload peak detection for a session."""
    try:
        result = await db.execute(
            select(LoadEstimateRecord)
            .where(LoadEstimateRecord.session_id == session_id)
            .order_by(LoadEstimateRecord.ts.asc())
        )
        rows = result.scalars().all()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DB error: {exc}")

    if not rows:
        raise HTTPException(status_code=404, detail="No data found.")

    loads = [r.load_score for r in rows]
    ts    = [r.ts for r in rows]
    # min_run as a count approximation: min_duration_ms / 100 ms per estimate
    min_run = max(1, min_duration_ms // 100)
    peaks = _detect_peaks(loads, ts, threshold=threshold, min_run=min_run)

    return {
        "session_id": session_id,
        "threshold": threshold,
        "min_duration_ms": min_duration_ms,
        "peak_count": len(peaks),
        "peaks": peaks,
    }


@router.get("/users/{user_id}/fingerprint")
async def user_fingerprint(
    user_id: str,
    limit_sessions: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """
    Cognitive fingerprint: per-signal statistics across the user's sessions.

    Returns mean dominance frequency for each behavioural signal, normalised
    to sum to 1.0.  Intended for the radar chart in the dashboard.
    """
    try:
        # Fetch session IDs for this user
        sessions_result = await db.execute(
            select(SessionModel.id)
            .where(SessionModel.user_id == user_id)
            .order_by(SessionModel.started_at.desc())
            .limit(limit_sessions)
        )
        session_ids = [r[0] for r in sessions_result.all()]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DB error: {exc}")

    if not session_ids:
        raise HTTPException(status_code=404, detail=f"No sessions for user {user_id}")

    try:
        estimates_result = await db.execute(
            select(LoadEstimateRecord.dominant_signal, LoadEstimateRecord.load_score)
            .where(LoadEstimateRecord.session_id.in_(session_ids))
        )
        rows = estimates_result.all()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DB error: {exc}")

    if not rows:
        raise HTTPException(status_code=404, detail="No estimates found for this user.")

    signal_counts: dict[str, int] = {}
    load_total = 0.0
    for dominant, load in rows:
        sig = dominant or "unknown"
        signal_counts[sig] = signal_counts.get(sig, 0) + 1
        load_total += load

    total = sum(signal_counts.values()) or 1
    fingerprint = {sig: round(count / total, 4) for sig, count in signal_counts.items()}
    avg_load = round(load_total / len(rows), 4)

    return {
        "user_id": user_id,
        "sessions_analysed": len(session_ids),
        "estimates_analysed": len(rows),
        "avg_load": avg_load,
        "fingerprint": fingerprint,
    }


@router.get("/compare")
async def compare_sessions(
    session_a: str = Query(...),
    session_b: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Side-by-side comparison of two sessions."""

    async def _stats(sid: str) -> dict:
        result = await db.execute(
            select(LoadEstimateRecord)
            .where(LoadEstimateRecord.session_id == sid)
            .order_by(LoadEstimateRecord.ts.asc())
        )
        rows = result.scalars().all()
        if not rows:
            return {"session_id": sid, "error": "no data"}
        loads = [r.load_score for r in rows]
        ts    = [r.ts for r in rows]
        avg   = sum(loads) / len(loads)
        vol   = float(math.sqrt(sum((l - avg) ** 2 for l in loads) / len(loads)))
        return {
            "session_id": sid,
            "count": len(rows),
            "avg_load": round(avg, 4),
            "peak_load": round(max(loads), 4),
            "volatility": round(vol, 4),
            "flow_index": _flow_index(loads),
            "duration_ms": ts[-1] - ts[0] if len(ts) > 1 else 0,
            "peak_count": len(_detect_peaks(loads, ts)),
        }

    stats_a = await _stats(session_a)
    stats_b = await _stats(session_b)

    return {
        "session_a": stats_a,
        "session_b": stats_b,
        "delta": {
            k: round(stats_b.get(k, 0) - stats_a.get(k, 0), 4)
            for k in ["avg_load", "peak_load", "volatility", "flow_index", "peak_count"]
            if isinstance(stats_a.get(k), (int, float))
        },
    }


@router.get("/sessions/{session_id}/segments")
async def session_segments(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Chronological cognitive segment map.

    Replays the session load stream through the same flow/overload
    detectors used by the real-time inferencer and returns a list of
    labelled episodes:
      type="flow"     — sustained low-load (< FLOW_ENTRY_THRESHOLD)
      type="overload" — sustained high-load (> 0.65)
      type="normal"   — everything in between (background segments fill gaps)

    Each segment carries: start_ts, end_ts, duration_ms, avg_load,
    peak_load (overload) / min_load (flow), window_count.
    """
    try:
        result = await db.execute(
            select(LoadEstimateRecord)
            .where(LoadEstimateRecord.session_id == session_id)
            .order_by(LoadEstimateRecord.ts.asc())
        )
        rows = result.scalars().all()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DB error: {exc}")

    if not rows:
        raise HTTPException(status_code=404, detail=f"No data for session {session_id}")

    loads = [r.load_score for r in rows]
    tss   = [r.ts for r in rows]

    segments: list[dict] = []

    # ------------------------------------------------------------------ #
    # Pass 1: flow episodes (hysteresis FSM)                              #
    # ------------------------------------------------------------------ #
    in_flow = False
    flow_start_idx = 0
    flow_spans: list[tuple[int, int]] = []   # (start_idx, end_idx inclusive)

    for i, load in enumerate(loads):
        if not in_flow:
            if load < FLOW_ENTRY_THRESHOLD:
                in_flow = True
                flow_start_idx = i
        else:
            if load > FLOW_EXIT_THRESHOLD:
                run_len = i - flow_start_idx
                if run_len >= FLOW_MIN_WINDOWS:
                    flow_spans.append((flow_start_idx, i - 1))
                in_flow = False

    if in_flow and (len(loads) - flow_start_idx) >= FLOW_MIN_WINDOWS:
        flow_spans.append((flow_start_idx, len(loads) - 1))

    # ------------------------------------------------------------------ #
    # Pass 2: overload episodes (same _detect_peaks logic)                #
    # ------------------------------------------------------------------ #
    overload_spans: list[tuple[int, int]] = []
    i = 0
    while i < len(loads):
        if loads[i] >= 0.65:
            j = i
            while j < len(loads) and loads[j] >= 0.65:
                j += 1
            if j - i >= 3:
                overload_spans.append((i, j - 1))
            i = j
        else:
            i += 1

    # ------------------------------------------------------------------ #
    # Merge spans into chronological segment list                         #
    # ------------------------------------------------------------------ #
    tagged: list[tuple[int, int, str]] = (
        [(s, e, "flow") for s, e in flow_spans]
        + [(s, e, "overload") for s, e in overload_spans]
    )
    tagged.sort(key=lambda t: t[0])

    # Fill gaps with "normal" segments
    filled: list[tuple[int, int, str]] = []
    cursor = 0
    for s, e, kind in tagged:
        if s > cursor:
            filled.append((cursor, s - 1, "normal"))
        filled.append((s, e, kind))
        cursor = e + 1
    if cursor < len(loads):
        filled.append((cursor, len(loads) - 1, "normal"))

    for s, e, kind in filled:
        seg_loads = loads[s: e + 1]
        avg_l = sum(seg_loads) / len(seg_loads)
        seg: dict = {
            "type": kind,
            "start_ts": tss[s],
            "end_ts": tss[e],
            "duration_ms": tss[e] - tss[s],
            "window_count": e - s + 1,
            "avg_load": round(avg_l, 4),
        }
        if kind == "overload":
            seg["peak_load"] = round(max(seg_loads), 4)
        elif kind == "flow":
            seg["min_load"] = round(min(seg_loads), 4)
            seg["avg_depth"] = round(1.0 - avg_l, 4)
        segments.append(seg)

    flow_count    = sum(1 for sg in segments if sg["type"] == "flow")
    overload_count = sum(1 for sg in segments if sg["type"] == "overload")
    flow_ms       = sum(sg["duration_ms"] for sg in segments if sg["type"] == "flow")
    total_ms      = tss[-1] - tss[0] if len(tss) > 1 else 1

    return {
        "session_id": session_id,
        "segment_count": len(segments),
        "flow_episode_count": flow_count,
        "overload_episode_count": overload_count,
        "flow_time_fraction": round(flow_ms / max(total_ms, 1), 4),
        "segments": segments,
    }


@router.get("/sessions/{session_id}/correlations")
async def session_correlations(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Pearson r between each behavioural signal and the session load score.

    The DB stores only the load_score and dominant_signal per estimate.
    To compute per-signal correlations we reconstruct a proxy signal
    weight from dominance frequency vs load quartile.

    Returns signals ranked by absolute correlation so the frontend
    can display which signals drove load for this particular user.
    """
    try:
        result = await db.execute(
            select(LoadEstimateRecord)
            .where(LoadEstimateRecord.session_id == session_id)
            .order_by(LoadEstimateRecord.ts.asc())
        )
        rows = result.scalars().all()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DB error: {exc}")

    if not rows:
        raise HTTPException(status_code=404, detail=f"No data for session {session_id}")

    loads = [r.load_score for r in rows]
    n = len(loads)

    if n < 10:
        raise HTTPException(
            status_code=422,
            detail="Not enough data for correlations (need ≥ 10 estimates)."
        )

    # Build per-signal binary dominance vector then compute point-biserial r
    # (equivalent to Pearson r for a binary x against continuous y)
    signal_names = FEATURE_NAMES
    correlations: list[dict] = []

    load_arr = loads
    load_mean = sum(load_arr) / n
    load_var  = sum((v - load_mean) ** 2 for v in load_arr) / n
    load_std  = math.sqrt(load_var) if load_var > 0 else 1.0

    for sig in signal_names:
        # Binary indicator: 1 when this signal was dominant, else 0
        indicator = [1.0 if (r.dominant_signal == sig) else 0.0 for r in rows]
        ind_mean  = sum(indicator) / n

        if ind_mean == 0.0 or ind_mean == 1.0:
            # Signal was never (or always) dominant — r is undefined
            correlations.append({
                "signal": sig,
                "pearson_r": 0.0,
                "dominance_rate": round(ind_mean, 4),
                "n_dominant": int(sum(indicator)),
            })
            continue

        # Pearson r = cov(x, y) / (std_x * std_y)
        cov = sum((indicator[i] - ind_mean) * (load_arr[i] - load_mean) for i in range(n)) / n
        ind_std = math.sqrt(sum((v - ind_mean) ** 2 for v in indicator) / n)
        r = cov / (ind_std * load_std) if ind_std > 0 else 0.0

        correlations.append({
            "signal": sig,
            "pearson_r": round(float(r), 4),
            "dominance_rate": round(ind_mean, 4),
            "n_dominant": int(sum(indicator)),
        })

    correlations.sort(key=lambda c: abs(c["pearson_r"]), reverse=True)

    return {
        "session_id": session_id,
        "n_estimates": n,
        "correlations": correlations,
        "top_signal": correlations[0]["signal"] if correlations else "unknown",
    }
