"""
Session management API.
Clients call POST /api/sessions/start when NeuroFlow SDK initializes,
and POST /api/sessions/end when they disconnect.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import uuid

router = APIRouter()


class SessionStart(BaseModel):
    user_id: str
    app_context: Optional[str] = None   # "vscode", "browser", "reference-app"


class SessionEnd(BaseModel):
    session_id: str


@router.post("/start")
async def start_session(body: SessionStart):
    session_id = str(uuid.uuid4())
    # TODO Sprint 2: persist to DB
    return {"session_id": session_id, "status": "started"}


@router.post("/end")
async def end_session(body: SessionEnd):
    # TODO Sprint 2: mark session as ended in DB
    return {"session_id": body.session_id, "status": "ended"}


@router.get("/{session_id}/estimates")
async def get_session_estimates(session_id: str, limit: int = 500):
    """Fetch load estimates for a session — used by the research dashboard."""
    # TODO Sprint 2: query from DB
    return {"session_id": session_id, "estimates": [], "count": 0}
