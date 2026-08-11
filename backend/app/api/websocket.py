"""
WebSocket hub: receives behavioral signals from browser extensions,
emits real-time cognitive load estimates back to clients.

Each session_id gets its own CognitiveLoadInferencer instance.
Estimates are persisted to Postgres and broadcast to any active watchers.
"""
import json
import logging
from collections import defaultdict
from typing import Dict, List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.ml.inference import CognitiveLoadInferencer, BehavioralSignal
from app.db import AsyncSessionLocal
from app.db.models import LoadEstimateRecord

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory pub/sub: session_id -> list of watcher WebSockets
# Watchers connect via /ws/watch/{session_id} and receive load estimates live.
_watchers: Dict[str, List[WebSocket]] = defaultdict(list)


async def _broadcast_to_watchers(session_id: str, payload: dict) -> None:
    """Send a load estimate to all active watchers of a session."""
    dead: List[WebSocket] = []
    for ws in _watchers.get(session_id, []):
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        try:
            _watchers[session_id].remove(ws)
        except ValueError:
            pass


@router.websocket("/signal/{session_id}")
async def signal_stream(websocket: WebSocket, session_id: str):
    """Receive behavioral signals, compute load estimates, persist, and broadcast."""
    await websocket.accept()
    inferencer = CognitiveLoadInferencer()

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)

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
            if estimate:
                payload = {
                    "type": "load_estimate",
                    "load": estimate.load_score,
                    "confidence": estimate.confidence,
                    "dominant": estimate.dominant_signal,
                    "model_type": estimate.model_type if hasattr(estimate, "model_type") else "heuristic",
                    "ts": data["ts"],
                    "session_id": session_id,
                }

                # Send to the originating client
                await websocket.send_json(payload)

                # Broadcast to all watchers of this session
                await _broadcast_to_watchers(session_id, payload)

                # Persist to Postgres (non-blocking -- don't fail the WS if DB is down)
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
    except Exception as e:
        try:
            await websocket.close(code=1011, reason=str(e))
        except Exception:
            pass


@router.websocket("/watch/{session_id}")
async def watch_stream(websocket: WebSocket, session_id: str):
    """
    Watch-only WebSocket: subscribe to another session's live load estimates.

    Connect to this endpoint to observe session_id's cognitive load in real time
    without sending any behavioral signals. Used by the session sharing feature.
    """
    await websocket.accept()
    _watchers[session_id].append(websocket)

    # Send an initial handshake so the client knows it's connected
    await websocket.send_json({
        "type": "watch_connected",
        "session_id": session_id,
        "message": f"Watching session {session_id}",
    })

    try:
        # Keep alive -- the client just holds the connection open
        while True:
            # Accept pings / any text to keep the connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        try:
            _watchers[session_id].remove(websocket)
        except ValueError:
            pass
