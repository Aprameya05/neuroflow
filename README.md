# NeuroFlow

![CI](https://github.com/Aprameya05/neuroflow/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue)
![Python](https://img.shields.io/badge/python-3.11-blue)
![Node](https://img.shields.io/badge/node-20-green)

> An interface that becomes simpler when you are overwhelmed, and richer when you are in flow.

Most software is designed for an average user in an average cognitive state. Neither exists. Your attention, memory load, and processing capacity fluctuate constantly across a day, a task, a conversation. No production system today accounts for this. NeuroFlow does.

NeuroFlow is a real-time adaptive interface system that infers cognitive load from behavioral signals -- keystroke rhythm, mouse movement entropy, error rate, pause patterns, tab switching -- and dynamically adjusts interface complexity in response. No EEG. No wearable. Just the signals already present in how you interact with a computer.

This is not a settings panel. This is the interface thinking.

---

## What we are building

NeuroFlow has five components that work together as a system:

**Signal Collector** -- A Chrome extension that runs silently on any webpage and samples behavioral signals every 100ms. It captures inter-keystroke intervals, mouse velocity and jerkiness, scroll patterns, error rate, and context switches. Streamed via WebSocket to the inference backend.

**Inference Engine** -- A FastAPI backend that receives the signal stream and runs a sliding-window bidirectional LSTM to produce a continuous cognitive load score between 0 and 1. Trained on calibration data with NASA-TLX self-reports as ground truth. Before the model is trained, a heuristic stub keeps the system functional end-to-end.

**Adaptive UI Runtime** -- A TypeScript SDK any web application can integrate in three lines. Subscribes to the load score and drives CSS custom properties in real time. `--nf-load` gives a continuous signal. `data-nf-state` gives a discrete state: `rich`, `normal`, `reduced`, or `minimal`.

**Research Dashboard** -- A React application showing live load score, session history, dominant signals, and adaptation events. Doubles as a research tool and demo artifact.

**Reference App** -- A CodeMirror-based adaptive code editor demonstrating all four UI states. The sidebar collapses under high load. Font scales up. Autocomplete becomes more aggressive. Notifications suppressed. This is the demo.

---

## Why this is novel

No existing production system adapts interface complexity to inferred cognitive state without physiological sensors. The closest academic work requires EEG or eye tracking. NeuroFlow is the first open, extensible framework that works from signals every computer already has.

The calibration dataset we produce -- behavioral signals paired with NASA-TLX cognitive load labels -- does not exist publicly. We will release it. That alone is a research contribution.

Target venue: CHI 2026 / UIST 2026.

---

## Demo

The reference app shows all four adaptive states:

| State | Load | What changes |
|-------|------|-------------|
| `rich` | < 21% | Full sidebar, source control, minimap, all panels |
| `normal` | < 35% | Standard VS Code-like layout |
| `reduced` | < 65% | Sidebar hidden, larger font, aggressive autocomplete |
| `minimal` | > 65% | Pure editor, zen vignette, maximum font, no distractions |

---

## Repository structure

```
neuroflow/
  backend/                    FastAPI inference server
    app/
      api/                    WebSocket hub, sessions, calibration endpoints
      ml/                     Bidirectional LSTM inference (ONNX runtime)
      db/                     SQLAlchemy models
      services/               Calibration service + normalization pipeline
    tests/                    Pytest test suite
    alembic/                  Database migrations

  extension/                  Chrome extension (Manifest V3)
    src/
      collector.js            Behavioral signal collection
      background.js           WebSocket management + badge
      popup.js                Extension popup UI

  sdk/                        TypeScript adaptive UI SDK (@neuroflow/sdk)
    src/
      core/NeuroFlow.ts       Core class -- signal collection + CSS adaptation
      hooks/useNeuroFlow.ts   React hook wrapper

  dashboard/                  React research dashboard
    src/
      components/             LoadGauge, LoadTimeline, SignalBreakdown
      components/             CalibrationFlow, NBackTask, NasaTLX
      hooks/                  WebSocket connection hook

  reference-app/              Adaptive code editor
    src/
      hooks/useNeuroFlow.ts   Live signal collection + load state
      components/             AdaptiveEditor, LoadHUD

  research/
    training/                 LSTM training pipeline (runs on A100)
    user-study/               Protocol, analysis scripts
    paper/                    CHI 2026 paper scaffold

  infra/docker/               Postgres + Redis
```

---

## Team

**Aprameya** -- backend, ML pipeline, Chrome extension, calibration protocol, infrastructure, model training

**Aashritha** -- TypeScript SDK, React dashboard, reference app, calibration UI, user study design

Both -- research protocol, user study execution, paper writing

---

## Getting started

**Prerequisites:** Python 3.11+, Node.js 20+, Docker Desktop, Git, Chrome

**Backend**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API explorer at http://localhost:8000/docs

**Dashboard**
```bash
cd dashboard && npm install && npm run dev
```
Open http://localhost:5173

**Reference App**
```bash
cd reference-app && npm install && npm run dev
```
Open http://localhost:5174

**Chrome Extension**
1. Go to chrome://extensions
2. Enable Developer mode
3. Load unpacked -- select the `extension/` folder

---

## Research targets

- CHI 2026 / UIST 2026 paper submission
- `@neuroflow/sdk` published to npm
- First labeled behavioral cognitive load dataset without physiological sensors
- Production-deployable adaptive interface framework

---

## Contact

Aprameya -- github.com/Aprameya05

Aashritha -- github.com/aashrithateegavarapu
