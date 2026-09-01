"""NeuroFlow backend — FastAPI entry point (v2)"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.websocket import router as ws_router
from app.api.sessions import router as session_router
from app.api.calibration import router as calibration_router
from app.api.analytics import router as analytics_router
from app.core.config import settings

app = FastAPI(
    title="NeuroFlow API",
    description=(
        "Real-time cognitive load inference, adaptive UI coordination, "
        "session analytics, and 60-second-ahead load forecasting."
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(ws_router,          prefix="/ws")
app.include_router(session_router,     prefix="/api/sessions",  tags=["sessions"])
app.include_router(calibration_router, prefix="/api/calibration", tags=["calibration"])
app.include_router(analytics_router,   prefix="/api/analytics", tags=["analytics"])


@app.get("/health", tags=["infra"])
async def health():
    return {"status": "ok", "version": "2.0.0"}


@app.get("/", tags=["infra"])
async def root():
    return {
        "name": "NeuroFlow API",
        "version": "2.0.0",
        "docs": "/docs",
        "ws_signal": "/ws/signal/{session_id}",
        "ws_watch":  "/ws/watch/{session_id}",
    }
