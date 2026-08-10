"""NeuroFlow backend — FastAPI entry point"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.websocket import router as ws_router
from app.api.sessions import router as session_router
from app.api.calibration import router as calibration_router
from app.core.config import settings

app = FastAPI(
    title="NeuroFlow API",
    description="Real-time cognitive load inference and adaptive UI coordination",
    version="0.1.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(ws_router, prefix="/ws")
app.include_router(session_router, prefix="/api/sessions")
app.include_router(calibration_router, prefix="/api/calibration")

@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
