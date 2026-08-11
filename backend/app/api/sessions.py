"""
Session management API.
Clients call POST /api/sessions/start when NeuroFlow SDK initializes,
and POST /api/sessions/end when they disconnect.
"""
import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db import get_db
from app.db.models import Session as SessionModel, LoadEstimateRecord

logger = logging.getLogger(__name__)
router = APIRouter()


class SessionStart(BaseModel):
    user_id: str
    app_context: Optional[str] = None   # "vscode", "browser", "reference-app"


class SessionEnd(BaseModel):
    session_id: str


@router.post("/start")
async def start_session(body: SessionStart, db: AsyncSession = Depends(get_db)):
    session_id = str(uuid.uuid4())
    try:
        record = SessionModel(
            id=session_id,
            user_id=body.user_id,
            app_context=body.app_context,
        )
        db.add(record)
        await db.commit()
    except Exception as e:
        logger.warning("Could not persist session start: %s", e)
    return {"session_id": session_id, "status": "started"}


@router.post("/end")
async def end_session(body: SessionEnd, db: AsyncSession = Depends(get_db)):
    from datetime import datetime
    try:
        result = await db.execute(
            select(SessionModel).where(SessionModel.id == body.session_id)
        )
        session = result.scalar_one_or_none()
        if session:
            session.ended_at = datetime.utcnow()
            await db.commit()
    except Exception as e:
        logger.warning("Could not persist session end: %s", e)
    return {"session_id": body.session_id, "status": "ended"}


@router.get("/{session_id}/estimates")
async def get_session_estimates(
    session_id: str,
    limit: int = 500,
    db: AsyncSession = Depends(get_db),
):
    """Fetch load estimates for a session — used by the research dashboard."""
    try:
        result = await db.execute(
            select(LoadEstimateRecord)
            .where(LoadEstimateRecord.session_id == session_id)
            .order_by(LoadEstimateRecord.ts.asc())
            .limit(limit)
        )
        rows = result.scalars().all()
        return {
            "session_id": session_id,
            "estimates": [
                {
                    "ts": r.ts,
                    "load": r.load_score,
                    "confidence": r.confidence,
                    "dominant": r.dominant_signal,
                }
                for r in rows
            ],
            "count": len(rows),
        }
    except Exception as e:
        logger.warning("DB query failed for session %s: %s", session_id, e)
        return {"session_id": session_id, "estimates": [], "count": 0}


@router.get("/{session_id}/replay")
async def replay_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    GET /api/sessions/{session_id}/replay

    Returns all load estimates for a session in chronological order,
    suitable for replaying the session like a video in the dashboard.
    """
    try:
        result = await db.execute(
            select(LoadEstimateRecord)
            .where(LoadEstimateRecord.session_id == session_id)
            .order_by(LoadEstimateRecord.ts.asc())
        )
        rows = result.scalars().all()

        if not rows:
            raise HTTPException(status_code=404, detail=f"No data found for session {session_id}")

        estimates = [
            {
                "ts": r.ts,
                "load": r.load_score,
                "confidence": r.confidence,
                "dominant": r.dominant_signal,
                "raw_features": r.raw_features,
            }
            for r in rows
        ]

        # Compute summary stats
        loads = [r.load_score for r in rows]
        avg_load = sum(loads) / len(loads)
        peak_load = max(loads)
        duration_ms = rows[-1].ts - rows[0].ts if len(rows) > 1 else 0

        return {
            "session_id": session_id,
            "estimates": estimates,
            "count": len(estimates),
            "summary": {
                "avg_load": round(avg_load, 4),
                "peak_load": round(peak_load, 4),
                "duration_ms": duration_ms,
                "started_at": rows[0].ts,
                "ended_at": rows[-1].ts,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Replay query failed for session %s: %s", session_id, e)
        raise HTTPException(status_code=500, detail="Failed to retrieve session replay data")
