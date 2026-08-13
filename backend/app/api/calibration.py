"""
Calibration API - receives completed calibration task results,
stores each N-back round as a calibration session.

Frontend sends all three calibration rounds together after
the full calibration flow is completed.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Dict, List

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.db.models import CalibrationSession


router = APIRouter()


# ---------------------------------------------------------
# Request models
# ---------------------------------------------------------

class CalibrationRound(BaseModel):
    n: int

    nback_accuracy: float
    nback_avg_rt_ms: float
    nback_hits: int
    nback_misses: int
    nback_false_alarms: int

    nasa_tlx_overall: float
    nasa_tlx_raw: Dict[str, float]

    duration_ms: int


class CalibrationSubmission(BaseModel):
    user_id: str
    rounds: List[CalibrationRound]


# ---------------------------------------------------------
# Response model
# ---------------------------------------------------------

class CalibrationResponse(BaseModel):
    status: str
    sessions_recorded: int
    normalization_updated: bool
    message: str


# ---------------------------------------------------------
# Submit calibration
# ---------------------------------------------------------

@router.post("/submit", response_model=CalibrationResponse)
async def submit_calibration(
    submission: CalibrationSubmission,
    db: AsyncSession = Depends(get_db),
):
    """
    Save all completed calibration rounds.

    Each N-back round becomes one CalibrationSession
    database record.
    """

    sessions = []

    for round_data in submission.rounds:

        session = CalibrationSession(
            user_id=submission.user_id,

            # 1 = easy, 2 = medium, 3 = hard
            task_type=f"nback_{round_data.n}",

            difficulty=round_data.n,

            # NASA-TLX overall score = ground-truth cognitive load
            nasa_tlx_score=round_data.nasa_tlx_overall,

            # Actual duration of the N-back task
            duration_ms=round_data.duration_ms,

            # Store the complete feature vector for model training
            behavioral_features={
                "nback_accuracy": round_data.nback_accuracy,
                "nback_avg_rt_ms": round_data.nback_avg_rt_ms,
                "nback_hits": round_data.nback_hits,
                "nback_misses": round_data.nback_misses,
                "nback_false_alarms": round_data.nback_false_alarms,

                "nasa_tlx_overall": round_data.nasa_tlx_overall,
                "nasa_tlx_raw": round_data.nasa_tlx_raw,

                "duration_ms": round_data.duration_ms,
            },
        )

        sessions.append(session)

    # Save all three rounds
    db.add_all(sessions)
    await db.commit()

    return CalibrationResponse(
        status="received",
        sessions_recorded=len(sessions),
        normalization_updated=False,
        message=f"Calibration data saved. {len(sessions)} session(s) recorded.",
    )


# ---------------------------------------------------------
# Calibration status
# ---------------------------------------------------------

@router.get("/status/{user_id}")
async def calibration_status(
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Returns how many calibration sessions a user has completed.
    """

    from sqlalchemy import select, func

    result = await db.execute(
        select(func.count(CalibrationSession.id))
        .where(CalibrationSession.user_id == user_id)
    )

    sessions_completed = result.scalar() or 0

    return {
        "user_id": user_id,
        "sessions_completed": sessions_completed,
        "sessions_needed": 10,
        "is_calibrated": sessions_completed >= 10,
        "last_calibrated": None,
    }