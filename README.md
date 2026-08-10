# NeuroFlow

**Adaptive Cognitive Load Interface System**

> An interface that becomes simpler when you are overwhelmed, and richer when you are in flow.

NeuroFlow infers a user's real-time cognitive load from behavioral signals — keystroke dynamics, mouse movement entropy, error rates, and pause patterns — then dynamically adapts interface complexity in response. No EEG required.

## Why this is novel

No existing production system adapts interface complexity to inferred cognitive state in real time without physiological sensors. NeuroFlow is the first open, extensible framework for doing this.

## Structure

```
neuroflow/
├── backend/          FastAPI + WebSocket hub + ONNX inference pipeline
├── extension/        Browser extension — cross-platform signal collector
├── sdk/              TypeScript SDK — adaptive UI runtime (--nf-load CSS var)
├── dashboard/        React research dashboard (D3 + Recharts)
├── reference-app/    Adaptive code editor — proof of concept
├── research/         Jupyter notebooks, calibration protocol, analysis
└── infra/            Docker, deployment
```

## Team

- **You** — ML pipeline (PyTorch → ONNX), FastAPI backend, signal collection, calibration protocol, infrastructure
- **Aashritha** — TypeScript SDK, reference app, research dashboard, user study design

## Quickstart

```bash
cd infra/docker && docker compose up -d
cd ../../backend && pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Research targets

- CHI 2026 / UIST 2026
- Open-source SDK on npm
- First labeled behavioral cognitive-load dataset without physiological sensors
