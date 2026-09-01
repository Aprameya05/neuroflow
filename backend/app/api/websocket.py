"""
WebSocket hub — NeuroFlow v2.

Improvements over v1
--------------------
* Forecast payload  — every load estimate now includes a 6 s ahead load
  forecast, the confidence interval, and the trajectory phase.
* Fatigue & anomaly — fatigue_index and is_anomaly forwarded to clients.
* Rate limiting     — max MAX_SIGNALS_PER_SECOND per session; excess bursts
  are silently dropped to protect the backend.
* Heartbeat         — server sends a ping every 30 s; stale connections are
  reaped after two missed pongs (handled by the client's WebSocket layer).
* Session-level forecaster — one SessionForecaster per active session, so
  the Holt-Winters model accumulates state across the full session.
* Clean watcher fanout with dead-connection reaping.
* Structured error responses (JSON) instead of raw close codes.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from collections import defaultdict, deque
from typing import Dict, List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.ml.inference import CognitiveLoadInferencer, BehavioralSignal
from app.ml.predictor import SessionForecaster
from app.db import AsyncSessionLocal
from app.db.models import LoadEstimateRecord

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_SIGNALS_PER_SECOND = 50   # hard cap; 10 Hz is normal, 50 Hz is abuse
HEARTBEAT_INTERVAL_S   = 30   # ping interval
FORECAST_HORIZON       = 60   # steps ahead (= 6 s at 100 ms/step)

# ---------------------------------------------------------------------------
# In-memory state (per-process; acceptable for single-worker Render deploy)
# ---------------------------------------------------------------------------

# session_id → list of watcher WebSockets
_watchers: Dict[str, List[WebSocket]] = defaultdict(list)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _broadcast_to_watchers(session_id: str, payload: dict) -> None:
    """Fanout payload to all watchers of session_id; reap dead connections."""
    dead: List[WebSocket] = []
    for ws in list(_watchers.get(session_id, [])):
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        try:
            _watchers[session_id].remove(ws)
        except ValueError:
            pass


def _build_payload(
    session_id: str,
    data: dict,
    estimate,
    forecaster: SessionForecaster,
) -> dict:
    """Construct the full JSON payload sent to the client on each estimate."""
    forecast_result = forecaster.push(estimate.load_score)

    payload: dict = {
        "type": "load_estimate",
        # Core
        "load":             estimate.load_score,
        "raw_load":         estimate.raw_load,
        "confidence":       estimate.confidence,
        "dominant":         estimate.dominant_signal,
        "model_type":       estimate.model_type,
        "ts":               data["ts"],
        "session_id":       session_id,
        # v2 additions
        "fatigue_index":    estimate.fatigue_index,
        "is_anomaly":       estimate.is_anomaly,
        "predicted_load":   estimate.predicted_load,
        "session_pct":      estimate.session_percentile,
    }

    if forecast_result is not None:
        # Summarise the 60-step forecast to reduce payload size:
        # send 6-step samples (every 0.6 s) + the 60-step endpoint
        steps = [5, 11, 17, 23, 35, 59]
        payload["forecast"] = {
            "phase":         forecast_result.phase,
            "trend":         forecast_result.trend,
            "intervention":  forecast_result.intervention_detected,
            "points":        [round(forecast_result.forecast[i], 3) for i in steps if i < len(forecast_result.forecast)],
            "ci95_hi_60":    round(forecast_result.ci_95_upper[-1], 3) if forecast_result.ci_95_upper else None,
            "ci95_lo_60":    round(forecast_result.ci_95_lower[-1], 3) if forecast_result.ci_95_lower else None,
            "load_6s":       round(forecast_result.forecast[59], 3) if len(forecast_result.forecast) > 59 else None,
        }

    return payload


# ---------------------------------------------------------------------------
# Signal WebSocket — receives behavioural signals, emits estimates
# ---------------------------------------------------------------------------

@router.websocket("/signal/{session_id}")
async def signal_stream(websocket: WebSocket, session_id: str) -> None:
    await websocket.accept()

    inferencer  = CognitiveLoadInferencer()
    forecaster  = SessionForecaster(horizon_steps=FORECAST_HORIZON)

    # Rate-limiting: track signal arrival times in a 1-second window
    _signal_times: deque[float] = deque()

    # Heartbeat task
    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL_S)
            try:
                await websocket.send_json({"type": "ping", "ts": int(time.time() * 1000)})
            except Exception:
                break

    hb_task = asyncio.create_task(heartbeat())

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)

            # Handle pong from client
            if data.get("type") == "pong":
                continue

            # Rate limiting — drop excess signals silently
            now_ts = time.monotonic()
            _signal_times.append(now_ts)
            while _signal_times and _signal_times[0] < now_ts - 1.0:
                _signal_times.popleft()
            if len(_signal_times) > MAX_SIGNALS_PER_SECOND:
                continue   # drop — don't disconnect

            signal = BehavioralSignal(
                timestamp_ms=int(data["ts"]),
                keystroke_iki_ms=data.get("iki"),
                mouse_velocity=float(data.get("mv", 0.0)),
                mouse_acceleration=float(data.get("ma", 0.0)),
                mouse_direction_changes=int(data.get("mdc", 0)),
                scroll_velocity=float(data.get("sv", 0.0)),
                error_rate=float(data.get("er", 0.0)),
                tab_switches=int(data.get("ts_count", 0)),
                pause_duration_ms=float(data.get("pause", 0.0)),
                copy_paste_count=int(data.get("cp", 0)),
            )

            estimate = inferencer.push_signal(signal)
            if estimate is None:
                continue

            payload = _build_payload(session_id, data, estimate, forecaster)

            # Send to originating client
            await websocket.send_json(payload)

            # Fanout to watchers
            await _broadcast_to_watchers(session_id, payload)

            # Persist (non-blocking; don't fail the WS if DB is down)
            try:
                async with AsyncSessionLocal() as db:
                    record = LoadEstimateRecord(
                        session_id=session_id,
                        ts=int(data["ts"]),
                        load_score=estimate.load_score,
                        confidence=estimate.confidence,
                        dominant_signal=estimate.dominant_signal,
                        raw_features={k: v for k, v in data.items() if k != "ts"},
                    )
                    db.add(record)
                    await db.commit()
            except Exception as db_err:
                logger.warning("DB persist failed for session %s: %s", session_id, db_err)

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.exception("Unexpected error in signal_stream for %s", session_id)
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        hb_task.cancel()


# ---------------------------------------------------------------------------
# Watch WebSocket — read-only subscriber
# ---------------------------------------------------------------------------

@router.websocket("/watch/{session_id}")
async def watch_stream(websocket: WebSocket, session_id: str) -> None:
    """
    Subscribe to another session's live load estimates.

    The watcher receives the exact same payload as the signal sender,
    including forecast and fatigue data.  It cannot send signals.
    """
    await websocket.accept()
    _watchers[session_id].append(websocket)

    await websocket.send_json({
        "type": "watch_connected",
        "session_id": session_id,
        "message": f"Watching session {session_id}. You will receive real-time estimates.",
    })

    try:
        while True:
            # Accept any text (e.g. ping/pong) to keep the connection alive
            raw = await websocket.receive_text()
            data = json.loads(raw) if raw.strip().startswith("{") else {}
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong", "ts": int(time.time() * 1000)})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        try:
            _watchers[session_id].remove(websocket)
        except ValueError:
            pass
