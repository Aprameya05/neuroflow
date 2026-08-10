"""
Database models — SQLAlchemy async ORM.
Run `alembic upgrade head` to apply migrations (we'll set up alembic next sprint).
"""
from datetime import datetime
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Session(Base):
    """One row per user session (browser tab open with NeuroFlow active)."""
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)           # uuid from client
    user_id: Mapped[str] = mapped_column(String, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    app_context: Mapped[str | None] = mapped_column(String, nullable=True)  # "vscode", "browser", etc.
    estimates: Mapped[list["LoadEstimateRecord"]] = relationship(back_populates="session")


class LoadEstimateRecord(Base):
    """Persisted load estimate — used for research analysis and session replays."""
    __tablename__ = "load_estimates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), index=True)
    ts: Mapped[int] = mapped_column(Integer)           # epoch ms
    load_score: Mapped[float] = mapped_column(Float)
    confidence: Mapped[float] = mapped_column(Float)
    dominant_signal: Mapped[str] = mapped_column(String)
    raw_features: Mapped[dict] = mapped_column(JSON)   # the full feature vector, for retraining
    session: Mapped["Session"] = relationship(back_populates="estimates")


class CalibrationSession(Base):
    """
    Records from N-back / dual-task calibration runs.
    These become the ground-truth labels for model training.
    """
    __tablename__ = "calibration_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    task_type: Mapped[str] = mapped_column(String)        # "nback_1", "nback_2", "dual_task"
    difficulty: Mapped[int] = mapped_column(Integer)      # 1=easy, 2=medium, 3=hard
    nasa_tlx_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # self-report 0–100
    duration_ms: Mapped[int] = mapped_column(Integer)
    behavioral_features: Mapped[dict] = mapped_column(JSON)  # aggregated signal features
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
