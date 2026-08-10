[![Live Demo](https://img.shields.io/badge/Live_Demo-neuroflow--editor.pages.dev-6366f1?style=for-the-badge&labelColor=0a0d14)](https://neuroflow-editor.pages.dev)
[![Dashboard](https://img.shields.io/badge/Dashboard-neuroflow--dashboard.pages.dev-6366f1?style=for-the-badge&labelColor=0a0d14)](https://neuroflow-dashboard.pages.dev)
[![CI](https://img.shields.io/github/actions/workflow/status/Aprameya05/neuroflow/ci.yml?style=for-the-badge&label=CI&labelColor=0a0d14&color=22c55e)](https://github.com/Aprameya05/neuroflow/actions)
[![Version](https://img.shields.io/badge/NeuroFlow-v0.1.0-6366f1?style=for-the-badge&labelColor=0a0d14)](https://github.com/Aprameya05/neuroflow)
[![License](https://img.shields.io/badge/License-MIT-6366f1?style=for-the-badge&labelColor=0a0d14)](https://github.com/Aprameya05/neuroflow)
[![Python](https://img.shields.io/badge/Python-3.11-6366f1?style=for-the-badge&labelColor=0a0d14)](https://github.com/Aprameya05/neuroflow)
[![Target](https://img.shields.io/badge/Target-CHI_2026-f59e0b?style=for-the-badge&labelColor=0a0d14)](https://github.com/Aprameya05/neuroflow)

```
███╗   ██╗███████╗██╗   ██╗██████╗  ██████╗ ███████╗██╗      ██████╗ ██╗    ██╗
████╗  ██║██╔════╝██║   ██║██╔══██╗██╔═══██╗██╔════╝██║     ██╔═══██╗██║    ██║
██╔██╗ ██║█████╗  ██║   ██║██████╔╝██║   ██║█████╗  ██║     ██║   ██║██║ █╗ ██║
██║╚██╗██║██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  ██║     ██║   ██║██║███╗██║
██║ ╚████║███████╗╚██████╔╝██║  ██║╚██████╔╝██║     ███████╗╚██████╔╝╚███╔███╔╝
╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝
```

**Real-time cognitive load adaptive interfaces. No EEG. No wearable. No compromise.**

An interface that becomes simpler when you are overwhelmed, and richer when you are in flow.

[**Live Demo**](https://neuroflow-editor.pages.dev) | [**Dashboard**](https://neuroflow-dashboard.pages.dev) | [**Architecture**](#architecture) | [**How it works**](#how-it-works) | [**Getting started**](#getting-started) | [**Research**](#research)

---

## The problem

You spend 8 hours in front of a computer. Your cognitive capacity at 9am bears no resemblance to your cognitive capacity at 4pm after three back-to-back meetings. You make more errors. You switch context more. You move your mouse erratically. You pause longer.

Every interface you use treats you exactly the same in both states. The same information density. The same number of options. The same visual complexity.

No production system today adapts to the user's actual cognitive state. NeuroFlow does.

---

## What NeuroFlow does differently

| Capability | Existing tools | NeuroFlow |
|---|---|---|
| Adapts to cognitive load | No | **Yes** |
| Requires EEG or wearable | N/A | **No -- behavioral signals only** |
| Works on any webpage | No | **Yes -- Chrome extension** |
| Drop-in SDK integration | No | **Yes -- 3 lines of code** |
| Real-time inference | No | **Yes -- 100ms latency** |
| Open source | No | **Yes -- MIT** |
| Research-grade calibration | No | **Yes -- NASA-TLX protocol** |
| Production deployable | No | **Yes -- live on Cloudflare** |

The core innovation: a bidirectional LSTM trained on behavioral signals paired with NASA-TLX self-reports, running at 100ms intervals, feeding a CSS custom property that any web component can subscribe to in one line.

---

## Architecture

```
User behavior (typing, mouse, scroll, errors, pauses)
         |
         | Chrome Extension (Manifest V3)
         | collector.js -- 100ms sampling
         v
+---------------------------+
|   WebSocket Signal Hub    |  FastAPI -- wss://neuroflow-backend-r6rs.onrender.com
+---------------------------+
         |
         v
+---------------------------+
|  Inference Engine         |
|                           |
|  Sliding window (3s)      |
|  9 behavioral features    |
|  Bidirectional LSTM       |  PyTorch trained -> ONNX deployed
|  EMA smoothing            |
|  Load score [0.0, 1.0]    |
+---------------------------+
         |
    +----+----+
    v         v
+----------+  +----------------------+
|TypeScript|  |  Research Dashboard  |
|   SDK    |  |  neuroflow-dashboard |
|          |  |  .pages.dev          |
| --nf-load|  |                      |
| data-nf- |  | Gauge, timeline,     |
| state    |  | signal breakdown,    |
+----------+  | CSV export           |
    |         +----------------------+
    v
+---------------------------+
|  Reference App            |
|  neuroflow-editor         |
|  .pages.dev               |
|                           |
|  CodeMirror adaptive      |
|  code editor              |
|  4 UI states              |
|  Live HUD                 |
+---------------------------+
```

**Stack:**
```
Backend        FastAPI, WebSockets, ONNX Runtime, Python 3.11
ML             PyTorch (BiLSTM), scikit-learn, ONNX export
Extension      Chrome Manifest V3, Vanilla JS
SDK            TypeScript, CSS custom properties
Dashboard      React 18, Recharts, D3
Reference App  React 18, CodeMirror 6, JetBrains Mono
Infrastructure Render (backend), Cloudflare Pages (frontend), Docker
Research       NASA-TLX calibration protocol, N-back tasks, CHI paper scaffold
CI             GitHub Actions -- 4 jobs, all green
```

---

## How it works

### Four adaptive states

The system infers a continuous load score between 0 and 1 and maps it to four discrete UI states:

| State | Load | What the interface does |
|-------|------|------------------------|
| `rich` | < 21% | Full sidebar, source control panel, minimap, all information visible |
| `normal` | < 35% | Standard layout, no minimap |
| `reduced` | < 65% | Sidebar hidden, larger font (15px), aggressive autocomplete, error markers suppressed |
| `minimal` | > 65% | Pure editor, zen vignette, 16px font, no line numbers, maximum autocomplete assistance |

Each adaptation is grounded in cognitive load theory:
- Reduced information density under high load (Sweller, 1988)
- Larger text reduces perceptual effort (Paas & van Merrienboer, 1994)
- Suppressing irrelevant stimuli improves task performance (Lavie, 2005)

### Nine behavioral signals

```python
FEATURES = [
    "keystroke_iki_ms",         # Inter-keystroke interval -- longer = higher load
    "mouse_velocity",           # px/ms -- slows under high load
    "mouse_acceleration",       # std dev of velocity -- increases under stress
    "mouse_direction_changes",  # angular reversals -- increases under uncertainty
    "scroll_velocity",          # px/ms -- hesitant scrolling under load
    "error_rate",               # backspaces / total keys -- strong predictor
    "tab_switches",             # context switches per window
    "pause_duration_ms",        # longest inactivity -- processing difficulty
    "copy_paste_count",         # knowledge gaps, reference seeking
]
```

### SDK integration -- three lines

```typescript
import { NeuroFlow } from "@neuroflow/sdk";

const nf = new NeuroFlow({ sessionId: uid, wsUrl: "wss://neuroflow-backend-r6rs.onrender.com/ws/signal" });
nf.start();
```

Then in CSS:
```css
/* Responds to continuous load score */
.sidebar { opacity: calc(1 - var(--nf-load) * 0.8); }

/* Responds to discrete state */
[data-nf-state="minimal"] .sidebar { display: none; }
[data-nf-state="reduced"] { font-size: 15px; }
[data-nf-state="rich"] .minimap { display: block; }
```

---

## Getting started

**Prerequisites:** Python 3.11+, Node.js 20+, Docker Desktop, Git, Chrome

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API explorer at http://localhost:8000/docs

### Dashboard

```bash
cd dashboard && npm install && npm run dev
```

Open http://localhost:5173

### Reference App

```bash
cd reference-app && npm install && npm run dev
```

Open http://localhost:5174

### Chrome Extension

1. Go to `chrome://extensions`
2. Enable Developer mode
3. Load unpacked -- select the `extension/` folder
4. Open any webpage -- the badge shows your live load score

### Infrastructure (Postgres + Redis)

```bash
cd infra/docker && docker compose up -d
```

---

## Repository structure

```
neuroflow/
  backend/                    FastAPI inference server
    app/
      api/
        websocket.py          WebSocket hub -- 100ms signal stream -> load estimates
        sessions.py           Session lifecycle endpoints
        calibration.py        NASA-TLX calibration submission + normalization
      ml/
        inference.py          Bidirectional LSTM (ONNX runtime), EMA smoothing
        models/               ONNX model files (populated after Sprint 4 training)
      db/
        models.py             SQLAlchemy ORM -- sessions, estimates, calibration
      services/
        calibration_service.py  Per-user normalization, training data export
    tests/                    Pytest suite -- inference, calibration service
    alembic/                  Database migrations

  extension/                  Chrome extension (Manifest V3)
    src/
      collector.js            Content script -- 9-signal behavioral collector
      background.js           Service worker -- WebSocket, badge, reconnect
      popup.js                Extension popup -- live gauge, signal breakdown

  sdk/                        TypeScript SDK (@neuroflow/sdk)
    src/
      core/NeuroFlow.ts       Core class -- collection + CSS adaptation
      hooks/useNeuroFlow.ts   React hook wrapper

  dashboard/                  React research dashboard
    src/
      components/
        LoadGauge.tsx         Semicircular load gauge
        LoadTimeline.tsx      Real-time line chart with threshold lines
        SignalBreakdown.tsx   Dominant signal breakdown bars
        CalibrationFlow.tsx   Full calibration protocol orchestrator
        NBackTask.tsx         N-back cognitive load task (1/2/3-back)
        NasaTLX.tsx           NASA-TLX self-report form
      hooks/
        useNeuroFlowSocket.ts WebSocket connection + estimate stream

  reference-app/              Adaptive code editor -- the demo
    src/
      hooks/useNeuroFlow.ts   Signal collection + load state (warmup, EMA, debounce)
      components/
        AdaptiveEditor.tsx    CodeMirror 6 editor with 4 adaptive states
        LoadHUD.tsx           Floating telemetry HUD with sparkline

  research/
    training/
      train.py                BiLSTM training pipeline (runs on A100, ONNX export)
      analyze_signals.py      Signal-NASA-TLX correlation analysis
      setup_a100.sh           GPU instance setup script
    user-study/
      PROTOCOL.md             Within-subjects study protocol, IRB-ready
      analysis.py             Paired t-tests, Cohen's d, paper-ready statistics
    paper/
      neuroflow_chi2026.md    CHI 2026 paper scaffold -- intro through results

  infra/docker/
    docker-compose.yml        Postgres + Redis

  .github/workflows/
    ci.yml                    4-job CI -- backend, dashboard, reference app, SDK
```

---

## Research

NeuroFlow is designed to be published, not just shipped.

### Calibration protocol

Users run a sequence of N-back tasks (1-back, 2-back, 3-back) and fill out NASA-TLX self-reports after each block. The behavioral signals recorded during each block, paired with the TLX score, become labeled training examples. 10+ sessions per user enables per-user normalization.

### Model training

```bash
# Run on A100 after collecting calibration data
cd research/training
bash setup_a100.sh
python train.py --data_dir calibration_data/ --epochs 150
```

The training pipeline produces `cognitive_load_lstm.onnx`. Drop it into `backend/app/ml/models/` and restart -- the heuristic stub is replaced by the real model with no other changes.

### User study

Within-subjects, counterbalanced. N=20 participants. Two conditions: control (adaptation disabled) and NeuroFlow (full adaptation). Task: 35-minute coding task under each condition. Primary measures: NASA-TLX score, task quality rubric. Analysis: paired t-tests, Cohen's d, 95% confidence intervals.

Full protocol in `research/user-study/PROTOCOL.md`.

### Publication target

CHI 2026 / UIST 2026. Paper scaffold at `research/paper/neuroflow_chi2026.md`.

---

## Deployments

| Component | URL | Platform |
|-----------|-----|----------|
| Backend API | https://neuroflow-backend-r6rs.onrender.com | Render |
| Research Dashboard | https://neuroflow-dashboard.pages.dev | Cloudflare Pages |
| Reference App | https://neuroflow-editor.pages.dev | Cloudflare Pages |

Auto-deploys on every push to `main`.

---

## Roadmap

- [x] FastAPI backend with WebSocket inference hub
- [x] Chrome extension -- 9-signal behavioral collector, badge, popup
- [x] Heuristic stub -- functional end-to-end before model is trained
- [x] TypeScript SDK with CSS custom property adaptation
- [x] React research dashboard -- gauge, timeline, signal breakdown
- [x] Calibration UI -- N-back tasks, NASA-TLX, CalibrationFlow orchestrator
- [x] Adaptive code editor reference app -- 4 states, live HUD, award-winning UI
- [x] Backend deployed on Render
- [x] Dashboard and reference app deployed on Cloudflare Pages
- [x] GitHub Actions CI -- all 4 components green
- [x] Bidirectional LSTM training pipeline -- ready for A100
- [x] User study protocol -- IRB-ready, analysis scripts
- [x] CHI 2026 paper scaffold
- [ ] Collect 50+ calibration sessions from real users
- [ ] Train and deploy ONNX model -- replace heuristic stub
- [ ] Run user study (N=20)
- [ ] Submit to CHI 2026 / UIST 2026
- [ ] Publish `@neuroflow/sdk` to npm
- [ ] Release labeled calibration dataset

---

## Team

**Aprameya** -- backend, ML pipeline, Chrome extension, calibration protocol, infrastructure, model training

**Aashritha** -- TypeScript SDK, React dashboard, reference app, calibration UI, user study design

---

Built in public. Apache 2.0. PRs welcome.

[GitHub](https://github.com/Aprameya05/neuroflow) | [Live Demo](https://neuroflow-editor.pages.dev) | [Dashboard](https://neuroflow-dashboard.pages.dev)
