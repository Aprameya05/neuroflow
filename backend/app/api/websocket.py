"""
WebSocket hub: receives behavioral signals from browser extensions,
emits real-time cognitive load estimates back to clients.

Each session_id gets its own CognitiveLoadInferencer instance.
"""
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.ml.inference import CognitiveLoadInferencer, BehavioralSignal

router = APIRouter()


@router.websocket("/signal/{session_id}")
async def signal_stream(websocket: WebSocket, session_id: str):
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
                await websocket.send_json({
                    "type": "load_estimate",
                    "load": estimate.load_score,
                    "confidence": estimate.confidence,
                    "dominant": estimate.dominant_signal,
                    "ts": data["ts"],
                    "session_id": session_id,
                })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.close(code=1011, reason=str(e))
