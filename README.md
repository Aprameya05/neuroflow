# NeuroFlow

> An interface that becomes simpler when you are overwhelmed, and richer when you are in flow.

Most software is designed for an average user in an average cognitive state. Neither exists. Your attention, memory load, and processing capacity fluctuate constantly across a day, a task, a conversation. No production system today accounts for this. NeuroFlow does.

NeuroFlow is a real-time adaptive interface system that infers cognitive load from behavioral signals -- keystroke rhythm, mouse movement entropy, error rate, pause patterns, tab switching -- and dynamically adjusts interface complexity in response. No EEG. No wearable. Just the signals already present in how you interact with a computer.

This is not a settings panel. This is the interface thinking.

---

## What we are building

NeuroFlow has five components that work together as a system:

**Signal Collector** -- A Chrome extension that runs silently on any webpage and samples behavioral signals every 100ms. It captures inter-keystroke intervals, mouse velocity and jerkiness, scroll patterns, error rate, and context switches. These signals are streamed via WebSocket to the inference backend.

**Inference Engine** -- A FastAPI backend that receives the signal stream and runs a sliding-window LSTM model to produce a continuous cognitive load score between 0 and 1. The model is trained on calibration data collected from real users doing standardized cognitive tasks (N-back, dual-task) with NASA-TLX self-reports as ground truth labels. Before the model is trained, a heuristic stub keeps the system functional end-to-end.

**Adaptive UI Runtime** -- A TypeScript SDK that any web application can integrate. It subscribes to the load score and drives CSS custom properties on the document root in real time. `--nf-load` gives a continuous signal. `data-nf-state` gives a discrete state: `rich`, `normal`, `reduced`, or `minimal`. A component can respond with one CSS rule. No framework lock-in.

**Research Dashboard** -- A React application that visualizes the live load score, session history, dominant signals, and adaptation events. This doubles as a research tool for analyzing user study data and a demo artifact for anyone evaluating the system.

**Reference App** -- A CodeMirror-based code editor that integrates the NeuroFlow SDK and demonstrates visible, meaningful adaptation. The sidebar collapses under high load. Autocomplete becomes more aggressive when the user is struggling. Notifications are suppressed during focus. This is the demo that makes the concept tangible.

---

## Why this is not a hobby project

Every component of NeuroFlow is designed to be publishable, open-sourceable, and production-deployable.

The inference approach -- behavioral signal inference of cognitive load without physiological sensors -- is novel. There is no public system that does this. The closest academic work requires EEG or eye tracking. We are building the first framework that works with what every computer already knows about its user.

The calibration dataset we will produce -- behavioral signals paired with NASA-TLX cognitive load labels, collected during standardized tasks -- does not exist publicly. We will release it. That alone is a research contribution.

The SDK is designed to be dropped into any web application with three lines of code. That is the open-source product.

The target venue is CHI 2026 or UIST 2026. Both are the top venues in human-computer interaction. A paper here is career-defining.

---

## Repository structure

```
neuroflow/
  backend/                    FastAPI inference server
    app/
      api/
        websocket.py          WebSocket hub -- receives signals, emits load estimates
        sessions.py           Session start/end endpoints
        calibration.py        Calibration data submission and status
      ml/
        inference.py          Sliding-window LSTM inference (ONNX runtime)
        models/               ONNX model files (added in Sprint 4)
      db/
        models.py             SQLAlchemy ORM models
      core/
        config.py             Environment configuration
    alembic/                  Database migrations
    requirements.txt

  extension/                  Chrome extension (Manifest V3)
    manifest.json
    popup.html
    src/
      collector.js            Content script -- behavioral signal collection
      background.js           Service worker -- WebSocket management
      popup.js                Extension popup UI

  sdk/                        TypeScript adaptive UI SDK
    src/
      core/
        NeuroFlow.ts          Core class -- signal collection + CSS adaptation
      hooks/
        useNeuroFlow.ts       React hook wrapper
      index.ts

  dashboard/                  React research dashboard
    src/
      App.tsx
      components/
        LoadGauge.tsx         Semicircular load gauge
        LoadTimeline.tsx      Real-time line chart
        SignalBreakdown.tsx   Dominant signal breakdown
      hooks/
        useNeuroFlowSocket.ts WebSocket connection hook
      types.ts

  reference-app/              Adaptive code editor (Sprint 5)

  research/
    notebooks/
      01_signal_exploration.py    Correlation analysis of signals vs NASA-TLX
      02_model_training.py        LSTM training pipeline (runs on A100)
    data/                     Calibration session data (gitignored)

  infra/
    docker/
      docker-compose.yml      Postgres + Redis

  SPRINT_PLAN.md
  YOUR_TASKS_SPRINT2.md
  AASHRITHA_TASKS_SPRINT2.md
```

---

## Team

**Aprameya** -- backend, ML pipeline, Chrome extension, calibration protocol, infrastructure, model training

**Aashritha** -- TypeScript SDK, React dashboard, reference app, calibration UI, user study design

Both -- research protocol, user study execution, paper writing

---

## Current status

### Done

- FastAPI backend running with WebSocket inference hub
- Heuristic cognitive load stub returning real estimates
- Chrome extension built (collector, background worker, popup)
- React dashboard built (gauge, timeline, signal breakdown)
- Docker infrastructure for Postgres and Redis
- Full project scaffolded and pushed to GitHub at github.com/Aprameya05/neuroflow

### Aprameya -- Sprint 2 tasks

1. Load the Chrome extension into Chrome
   - Go to chrome://extensions
   - Enable Developer mode
   - Click Load unpacked
   - Select D:\neuroflow\extension
   - The extension badge should show ON when the backend is running

2. Verify real signals are flowing
   - Start backend: cd D:\neuroflow\backend then uvicorn app.main:app --reload
   - Open any webpage
   - Watch the extension badge show a live load percentage

3. Start Docker and verify the database is up
   - cd D:\neuroflow\infra\docker
   - docker compose up -d
   - docker ps should show postgres and redis running

4. Push the extension files to GitHub
   - git add .
   - git commit -m "feat: Sprint 2 -- Chrome extension loaded and verified"
   - git push

### Aashritha -- Sprint 2 tasks

Aashritha, welcome. Everything you need is in this repo. Your job right now is the dashboard.

**Step 1 -- Clone and run**

```bash
git clone https://github.com/Aprameya05/neuroflow.git
cd neuroflow/dashboard
npm install
npm run dev
```

Open http://localhost:5173. You will see the dashboard. It will show disconnected until Aprameya's backend is running. Once both are live, the gauge updates in real time.

**Step 2 -- Understand the codebase**

Start with these files in order:

- `dashboard/src/types.ts` -- the shape of data flowing through the system
- `dashboard/src/hooks/useNeuroFlowSocket.ts` -- how WebSocket data becomes React state
- `dashboard/src/components/LoadGauge.tsx` -- the main visual
- `dashboard/src/App.tsx` -- where everything comes together

Each file has comments. Read them before writing any code.

**Step 3 -- Your Sprint 2 deliverables**

All the code you need is in `AASHRITHA_TASKS_SPRINT2.md`. The three things to build:

1. UI State badge -- a colored indicator showing which of the four states (rich / normal / reduced / minimal) the system is currently in. The starter code is in your task file.

2. Estimate log -- a scrolling list of the last 12 load estimates with timestamps and dominant signals. Starter code is in your task file.

3. CSV export -- a button that downloads the session data as a CSV for research analysis. Starter code is in your task file.

When done, open a PR into main titled: `feat: Sprint 2 -- UI state badge, estimate log, CSV export`

---

## Sprint roadmap

### Sprint 3 -- Calibration Protocol

Aashritha builds the calibration UI. This is the most important piece of UX in the project because the data collected here trains the model.

The calibration flow works like this: a user runs through three types of tasks (1-back, 2-back, 3-back memory tasks, and a dual-task paradigm), then fills out a NASA-TLX self-report form rating their cognitive load. The behavioral signals recorded during each task block, paired with the NASA-TLX score, become training examples.

Aashritha owns the entire front-end of this flow. It needs to be clean, clear, and usable by people who have never heard of NeuroFlow. Think onboarding flow quality.

Aprameya wires the calibration submissions to the database and builds the normalization pipeline that computes per-user feature means and standard deviations from their calibration sessions.

### Sprint 4 -- Model Training

This is where the A100 hours get used.

Aprameya runs the signal exploration notebook to understand which signals correlate most with NASA-TLX scores across participants. Then trains the LSTM on the calibration dataset, exports to ONNX, and drops it into the backend. The heuristic stub is replaced. The system now infers cognitive load from a real model.

Aashritha adds a model vs heuristic comparison panel to the dashboard so we can validate that the model is doing better than the stub in live use.

### Sprint 5 -- Reference App

Aashritha builds the adaptive code editor. This is the demo. When someone asks "what does NeuroFlow actually do", this is what you show them.

The editor uses CodeMirror with the NeuroFlow SDK integrated. The adaptations are meaningful and visible: the file tree collapses under high load, autocomplete suggestions increase when the user is making errors, linting warnings are suppressed during deep focus, and the color theme subtly shifts. These are not cosmetic -- each adaptation is grounded in cognitive load research on attentional resources.

### Sprint 6 -- User Study and Paper

Twenty participants. Two conditions: control (standard editor) and NeuroFlow (adaptive editor). Each participant does a programming task under both conditions in counterbalanced order. Measures: task completion quality, self-reported cognitive load (NASA-TLX), time on task, error rate.

Statistical analysis: paired t-tests on the primary measures, effect size calculations, confidence intervals. The paper goes to CHI 2026 or UIST 2026.

---

## Technical decisions and why

**FastAPI over Django or Flask** -- async-native, WebSocket support built in, automatic OpenAPI docs generation, Pydantic validation. For a real-time signal processing server this is the right choice.

**ONNX for model deployment** -- train in PyTorch on the A100, export to ONNX, run inference with ONNX Runtime in the backend. This decouples training from serving and makes the model portable. ONNX Runtime is significantly faster than running PyTorch in inference mode.

**Sliding window LSTM** -- behavioral signals are time-series data with temporal dependencies. A user's keystroke rhythm over the last 3 seconds is more informative than any single moment. The LSTM captures this. The sliding window means inference is continuous and low-latency.

**CSS custom properties for adaptation** -- driving `--nf-load` as a CSS variable means any component in any framework can respond to cognitive load with one line of CSS. No JavaScript event listeners needed. The adaptation is declarative.

**Manifest V3 for the extension** -- this is the current Chrome extension standard. Manifest V2 is being phased out. Building on V3 from the start means the extension will continue working as Chrome evolves.

---

## Getting started

**Prerequisites**

- Python 3.11+
- Node.js 20+
- Docker Desktop
- Git
- Chrome

**Backend**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # Mac/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API explorer available at http://localhost:8000/docs

**Infrastructure**

```bash
cd infra/docker
docker compose up -d
```

**Dashboard**

```bash
cd dashboard
npm install
npm run dev
```

Open http://localhost:5173

**Chrome Extension**

1. Go to chrome://extensions
2. Enable Developer mode
3. Click Load unpacked
4. Select the extension/ folder

---

## Research targets

- CHI 2026 or UIST 2026 paper submission
- Open-source SDK published to npm as @neuroflow/sdk
- Calibration dataset published (first labeled behavioral cognitive load dataset without physiological sensors)
- Reference implementation as a real deployable tool

---

## Contact

Aprameya -- github.com/Aprameya05

Aashritha -- github.com/aashrithateegavarapu
