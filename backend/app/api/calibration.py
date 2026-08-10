"""
Calibration API — receives completed calibration task results,
stores them, and recomputes per-user normalization stats.

Frontend calls POST /api/calibration/submit after each N-back task block.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class CalibrationSubmission(BaseModel):
    user_id: str
    task_type: str          # "nback_1" | "nback_2" | "nback_3" | "dual_task"
    difficulty: int         # 1 | 2 | 3
    nasa_tlx_score: Optional[float] = None   # user fills this after the block
    duration_ms: int
    # Raw feature snapshot averaged over the calibration block
    features: dict[str, float]


class CalibrationResponse(BaseModel):
    status: str
    sessions_recorded: int
    normalization_updated: bool
    message: str


@router.post("/submit", response_model=CalibrationResponse)
async def submit_calibration(submission: CalibrationSubmission):
    """
    TODO (Sprint 3):
    1. Save to calibration_sessions table
    2. After N sessions, recompute feature means/stds for this user
    3. Push updated normalization to the live inferencer for this user
    """
    # Stub response — real implementation in Sprint 3
    return CalibrationResponse(
        status="received",
        sessions_recorded=1,
        normalization_updated=False,
        message="Calibration data saved. Need 10+ sessions to update normalization.",
    )


@router.get("/status/{user_id}")
async def calibration_status(user_id: str):
    """Returns how many calibration sessions a user has completed and whether model is calibrated."""
    # TODO: query DB
    return {
        "user_id": user_id,
        "sessions_completed": 0,
        "sessions_needed": 10,
        "is_calibrated": False,
        "last_calibrated": None,
    }
