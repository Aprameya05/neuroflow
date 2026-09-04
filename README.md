[![Live Demo](https://img.shields.io/badge/Live_Demo-neuroflow--editor.pages.dev-6366f1?style=for-the-badge&labelColor=0a0d14)](https://neuroflow-editor.pages.dev)
[![Dashboard](https://img.shields.io/badge/Dashboard-neuroflow--dashboard.pages.dev-6366f1?style=for-the-badge&labelColor=0a0d14)](https://neuroflow-dashboard.pages.dev)
[![CI](https://img.shields.io/github/actions/workflow/status/Aprameya05/neuroflow/ci.yml?style=for-the-badge&label=CI&labelColor=0a0d14&color=22c55e)](https://github.com/Aprameya05/neuroflow/actions)
[![Version](https://img.shields.io/badge/NeuroFlow-v2.0.0-6366f1?style=for-the-badge&labelColor=0a0d14)](https://github.com/Aprameya05/neuroflow)
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

[Live Demo](https://neuroflow-editor.pages.dev) | [Dashboard](https://neuroflow-dashboard.pages.dev) | [Backend API](https://neuroflow-backend-r6rs.onrender.com/docs)

---

## The problem

You spend 8 hours in front of a computer. Your cognitive capacity at 9am looks nothing like it does at 4pm after three back-to-back meetings. You make more errors. You switch context more. You move your mouse erratically. You pause longer.

Every interface you use treats you exactly the same in both states. The same information density. The same number of options. The same visual complexity.

No production system today adapts to the user's actual cognitive state in real time without a headset. NeuroFlow does.

---

## What makes it different

| Capability | Existing tools | NeuroFlow |
|---|---|---|
| Adapts to cognitive load | No | Yes |
| Requires EEG or wearable | N/A | No — behavioral signals only |
| Works on any webpage | No | Yes — Chrome extension |
| Drop-in SDK integration | No | Yes — 3 lines of code |
| Real-time inference | No | Yes — 100ms latency |
| Kalman-filtered load score | No | Yes — smooth, stable output |
| 60-second load forecast | No | Yes — Holt-Winters smoothing |
| Fatigue tracking | No | Yes — exponential decay model |
| Multi-tab signal aggregation | No | Yes — weighted merge by recency |
| Open source | No | Yes — MIT |
| Research-grade calibration | No | Yes — NASA-TLX protocol |
| Production deployable | No | Yes — live on Cloudflare and Render |

The core innovation: a bidirectional LSTM trained on behavioral signals paired with NASA-TLX self-reports, running at 100ms intervals, feeding a CSS custom property that any web component can subscribe to in one line. On top of that, a Kalman filter smooths the raw scores, a Holt-Winters forecaster predicts load 60 seconds ahead, and a per-session Welford baseline normalizes scores to each individual user rather than a global mean.

---

## Architecture

```
User behavior (typing, mouse, scroll, errors, focus, right-clicks, selections, idle patterns)
                                         |
                            Chrome Extension (Manifest V3)
                            collector.js -- 13-signal, 100ms sampling
                            background.js -- WebSocket, badge, 500-signal offline buffer
                                         |
                         +---------------------------+
                         |   WebSocket Signal Hub    |  FastAPI
                         |   /ws/signal/{session_id} |  wss://neuroflow-backend-r6rs.onrender.com
                         |   /ws/watch/{session_id}  |  rate-limited: 50 signals/s
                         |   heartbeat ping/pong     |
                         +---------------------------+
                                         |
                         +---------------------------+
                         |     Inference Engine      |
                         |                           |
                         |  Sliding window (3s)      |
                         |  13 behavioral features   |
                         |  Bidirectional LSTM        |  PyTorch trained -> ONNX deployed
                         |  Kalman filter (1D)        |  process noise Q=0.002, R=0.05
                         |  Welford session baseline  |  per-user z-score normalization
                         |  Mahalanobis confidence    |
                         |  Holt-Winters forecaster   |  60s horizon, phase + trend
                         |  Fatigue tracker           |  exponential decay, 20-min half-life
                         |  Anomaly detector          |  spike threshold 0.25
                         |  Load score [0.0, 1.0]    |
                         +---------------------------+
                                |              |
                           +----+              +----------------------------+
                           v                                               v
               +------------------+         +------------------+   +---------------------+
               | TypeScript SDK   |         | Postgres (async) |   | Research Dashboard  |
               |                  |         | Sessions         |   | dark sci-fi theme   |
               | --nf-load        |         | Load estimates   |   |                     |
               | --nf-density     |         | Replay endpoint  |   | Load gauge          |
               | --nf-fatigue     |         +------------------+   | Predictive timeline |
               | --nf-forecast    |                                 | Cognitive fingerprint|
               | data-nf-state    |         +------------------+   | Signal matrix       |
               | data-nf-phase    |         | Analytics API    |   | Session replay      |
               |                  |         | /summary         |   | Flow streak tracker |
               | Hysteresis SM    |         | /peaks           |   | Fatigue alert panel |
               | Plugin/observer  |         | /fingerprint     |   | Calibration UI      |
               | Predictive adapt |         | /compare         |   | CSV export          |
               +------------------+         +------------------+   +---------------------+
                           |
               +---------------------------+
               |      Reference App        |
               | neuroflow-editor.pages.dev|
               |                           |
               | CodeMirror 6 adaptive     |
               | 4 UI states               |
               | Predictive state HUD      |
               | Session sharing           |
               | Post-session report card  |
               | Flow celebration          |
               | Ctrl+1-4 demo shortcuts   |
               +---------------------------+
```

**Stack**

| Layer | Technologies |
|---|---|
| Backend | FastAPI, WebSockets, SQLAlchemy async, asyncpg, ONNX Runtime, Python 3.11 |
| ML | PyTorch (BiLSTM), scikit-learn, ONNX export, Kalman filter, Holt-Winters |
| Extension | Chrome Manifest V3, Vanilla JS |
| SDK | TypeScript, CSS custom properties, ESM + CJS dual output |
| Dashboard | React 18, Recharts (ComposedChart), SVG radar, D3 |
| Reference App | React 18, CodeMirror 6, JetBrains Mono |
| Infrastructure | Render (backend), Cloudflare Pages (frontend), Docker |
| Research | NASA-TLX calibration, N-back tasks, CHI paper scaffold |
| CI | GitHub Actions -- 4 jobs, all green |

---

## How it works

### Four adaptive states

The system infers a continuous load score between 0 and 1 and maps it to four discrete UI states with hysteresis (the score must cross a threshold by 0.04 before a transition commits, preventing visual flicker):

| State | Load | What the interface does |
|---|---|---|
| rich | < 21% | Full sidebar, source control panel, minimap, all information visible |
| normal | < 35% | Standard layout, no minimap |
| reduced | < 65% | Sidebar hidden, larger font (15px), aggressive autocomplete, error markers suppressed |
| minimal | > 65% | Pure editor, zen vignette, 16px font, no line numbers, maximum autocomplete assistance |

Each adaptation is grounded in cognitive load theory:
- Reduced information density under high load (Sweller, 1988)
- Larger text reduces perceptual effort (Paas and van Merrienboer, 1994)
- Suppressing irrelevant stimuli improves task performance (Lavie, 2005)

The v2 SDK also pre-adapts before a load crossing happens. When the Holt-Winters 6-second forecast shows the user is about to enter a higher-load state, the effective load is blended upward (60% forecast, 40% current) so the UI transitions smoothly before the user notices the cognitive pressure.

### Thirteen behavioral signals

```python
FEATURES = [
    "keystroke_iki_ms",   # inter-keystroke interval — longer = higher load
    "mouse_velocity",     # px/ms — slows under high load
    "mouse_acceleration", # std dev of velocity — erratic under stress
    "mouse_dir_changes",  # direction reversals — uncertainty proxy
    "scroll_velocity",    # px/ms — faster scanning = higher load
    "error_rate",         # backspace/delete ratio — typing errors
    "pause_duration",     # ms since last activity — cognitive pause
    "tab_switches",       # visibility changes — context switching
    "copy_paste",         # copy + paste events — reference behavior
    "right_clicks",       # context menu — uncertainty / exploration (v2)
    "selection_len",      # avg text selected — research vs scan mode (v2)
    "focus_switches",     # element focus changes — attention fragmentation (v2)
    "idle_quality",       # quick return ratio — deliberate pause vs distraction (v2)
]
```

Feature weights (heuristic, replaced by LSTM once trained):

| Signal | Weight |
|---|---|
| error_rate | 0.30 |
| pause_duration | 0.22 |
| mouse_acceleration | 0.18 |
| tab_switches | 0.14 |
| keystroke_iki | 0.09 |
| copy_paste | 0.07 |

### Signal processing pipeline

Raw signals from the collector go through three stages before reaching the UI:

1. **Kalman filter** smooths the per-window load score. The filter models load as a constant-velocity process (state: `[value, velocity]`), handling the measurement noise that comes from short 100ms windows. This eliminates jitter without introducing the lag that a simple moving average produces.

2. **Welford baseline** tracks each session's mean and variance online, without storing the full history. After a 60-window warmup, the raw score is converted to a session-normalized z-score and sigmoid-activated. This means the system adapts to each individual's behavioral baseline rather than a global population mean.

3. **Holt-Winters forecaster** runs on the smoothed scores and outputs a 60-second-ahead prediction with 80% and 95% confidence intervals. The forecast also classifies the current load phase as rising, falling, stable, or volatile, and flags intervention events when the trend reverses sharply.

### Fatigue tracking

Separate from the per-window load score, a fatigue index accumulates across the session:

```
fatigue = min(1, avg_load * 0.75 + duration_factor * 0.25)
```

where `duration_factor` grows from 0 to 1 over 30 minutes. The index decays with a 20-minute half-life when load drops. The dashboard's FatigueAlert component surfaces this as a dismissible banner with three severity levels (early 0.3, moderate 0.6, high 0.8) and a real-time sparkline of the last 30 readings. The extension popup mirrors the fatigue state alongside the load badge.

### Multi-tab signal aggregation

The extension's background service worker maintains a per-tab signal store and merges signals across all open tabs using a recency-weighted average. Tabs that have been inactive longer carry less weight, so the signal sent to the backend reflects the user's active cognitive context rather than noise from background tabs.

### Offline resilience

The background service worker buffers up to 500 signals in memory when the WebSocket is disconnected and flushes the buffer on reconnect. Reconnection uses exponential backoff starting at 1 second and capping at 60 seconds. The extension badge shows the buffer count during disconnection, "ON" when live, and "ERR" on fatal failure.

---

## CSS integration

The SDK writes a set of CSS custom properties to `:root` on every estimate:

```css
--nf-load              /* continuous load score, 0.0 – 1.0 */
--nf-density           /* 1 - load * 0.6 */
--nf-animation-speed   /* 0.2s + load * 0.5s */
--nf-secondary-opacity /* 1 - load * 0.7 */
--nf-fatigue           /* fatigue index, 0.0 – 1.0 */
--nf-forecast          /* predicted load 6s ahead */
```

And two HTML attributes:

```html
data-nf-state  /* "rich" | "normal" | "reduced" | "minimal" */
data-nf-phase  /* "rising" | "falling" | "stable" | "volatile" */
```

Usage examples:

```css
/* fade sidebar with load */
.sidebar { opacity: calc(1 - var(--nf-load) * 0.8); }

/* hide it entirely in minimal state */
[data-nf-state="minimal"] .sidebar { display: none; }

/* show AI hints more when fatigued */
.ai-hint { opacity: var(--nf-fatigue); }

/* slow animations when rising */
[data-nf-phase="rising"] * { transition-duration: var(--nf-animation-speed); }
```

---

## SDK quick start

```typescript
import { NeuroFlow } from '@neuroflow/sdk';

const nf = new NeuroFlow({
  sessionId: uid,
  wsUrl: 'wss://neuroflow-backend-r6rs.onrender.com/ws/signal',
});

nf.start();
```

Optional configuration:

```typescript
const nf = new NeuroFlow({
  sessionId: uid,
  wsUrl: '...',
  thresholds: { rich: 0.21, normal: 0.35, reduced: 0.65 },
  adaptationMode: 'smooth',
  hysteresisMs: 2000,
  respectCriticalInputs: true, // suppress adaptation in [data-nf-critical] fields
});

// listen to every estimate
nf.onLoadChange((estimate, uiState) => {
  console.log(estimate.load, uiState, estimate.forecast?.load_6s);
});

// plugin API
nf.use({
  name: 'my-plugin',
  onEstimate(estimate, state) { /* every estimate */ },
  onStateChange(from, to, estimate) { /* state transitions only */ },
});
```

Mark critical inputs to suppress adaptation mid-entry:

```html
<input data-nf-critical type="text" placeholder="Payment amount" />
```

---

## Reference app

**[neuroflow-editor.pages.dev](https://neuroflow-editor.pages.dev)**

An adaptive code editor built on CodeMirror 6. Open it, start typing, and the UI progressively simplifies as your behavioral signals indicate increasing load. The floating HUD shows the live load score, the 6-second forecast with a trend arrow, the predicted state transition (for example "to reduced in 6s"), and an anomaly pulse ring when the system detects an unusual spike.

Demo shortcuts (press and hold for 3 seconds, auto-release):
- `Ctrl+1` — force rich state
- `Ctrl+2` — force normal state
- `Ctrl+3` — force reduced state
- `Ctrl+4` — force minimal state

Sessions can be shared via a watch URL. Anyone with the link sees the editor in read-only mode with a live load overlay.

---

## Research dashboard

**[neuroflow-dashboard.pages.dev](https://neuroflow-dashboard.pages.dev)**

The research-facing view of a session. Components:

| Component | What it shows |
|---|---|
| LoadGauge | Semicircular SVG gauge with glow filter, color keyed to state |
| LoadTimeline | Recharts area chart with OLS predictive regression line |
| SignalBreakdown | Dominant signal bars for each 100ms window |
| StateDistribution | Concentric arc rings — time spent in each UI state |
| SessionStats | Focus score, volatility index, trend, total flow time |
| SignalMatrix | 9x30 signal dominance heatmap across a session |
| CognitiveFingerprint | SVG radar — behavioral signature across all 13 signals |
| SessionReplayPlayer | Scrubber with playback controls, re-plays load curve |
| FlowStreakBanner | Milestone banner when flow state is sustained |
| FatigueAlert | Dismissible banner with severity levels and sparkline |
| CalibrationFlow | N-back task orchestrator with NASA-TLX self-report |

### Calibration protocol

Users complete N-back tasks (1-back, 2-back, 3-back) and fill out a NASA-TLX form after each block. The behavioral signals during each block, paired with the TLX score, become labeled training examples. 10 or more sessions per user enables per-user normalization and significantly improves inference accuracy.

---

## Backend API

Base URL: `https://neuroflow-backend-r6rs.onrender.com`

### WebSocket

```
wss://.../ws/signal/{session_id}   send behavioral signals, receive load estimates
wss://.../ws/watch/{session_id}    read-only watch — for shared sessions
```

Load estimate payload:

```json
{
  "type": "load_estimate",
  "load": 0.42,
  "raw_load": 0.51,
  "confidence": 0.87,
  "dominant": "error_rate",
  "fatigue_index": 0.31,
  "is_anomaly": false,
  "predicted_load": 0.39,
  "session_pct": 67,
  "forecast": {
    "phase": "rising",
    "trend": 0.008,
    "intervention": false,
    "load_6s": 0.47,
    "points": [0.42, 0.43, 0.44, 0.45, 0.46, 0.47],
    "ci95_hi_60": 0.61,
    "ci95_lo_60": 0.33
  }
}
```

### REST endpoints

```
POST /api/sessions/start                      start a session
POST /api/sessions/end                        end a session
GET  /api/sessions/{id}/estimates             paginated load history
GET  /api/sessions/{id}/replay                full replay with summary stats

GET  /api/analytics/sessions/{id}/summary     flow index, health score, state distribution
GET  /api/analytics/sessions/{id}/forecast    Holt-Winters replay forecast
GET  /api/analytics/sessions/{id}/peaks       overload episodes (load > threshold for N consecutive estimates)
GET  /api/analytics/users/{id}/fingerprint    behavioral signal dominance frequencies
GET  /api/analytics/compare                   side-by-side session delta (?session_a=...&session_b=...)

POST /api/calibration/submit                  submit N-back + TLX calibration block
GET  /health
```

---

## ML training

Once you have enough calibration sessions:

```bash
cd research/training
bash setup_a100.sh
python train.py --data_dir calibration_data/ --epochs 150
```

The pipeline produces `cognitive_load_lstm.onnx`. Drop it into `backend/app/ml/models/` and restart. The Kalman filter, Welford baseline, and forecaster wrap the ONNX model transparently — no other changes needed.

---

## Repository layout

```
backend/
  app/
    api/
      websocket.py          WebSocket hub — rate limiting, heartbeat, forecast relay
      sessions.py           Session CRUD — start, end, estimates, replay
      calibration.py        Calibration submission endpoint
      analytics.py          Summary, peaks, fingerprint, compare endpoints
    ml/
      inference.py          KalmanFilter1D, SessionBaseline, FatigueTracker, CognitiveLoadInferencer
      predictor.py          HoltWintersForecaster, SessionForecaster, ForecastResult
      models/               cognitive_load_lstm.onnx (add after training)
    db/
      models.py             SQLAlchemy ORM — Session, LoadEstimateRecord
    core/
      config.py             Settings from environment variables
  tests/                    pytest test suite — inference, calibration

extension/                  Chrome extension (Manifest V3)
  src/
    collector.js            Content script — 13-signal behavioral collector
    background.js           Service worker — WebSocket, offline buffer, badge, reconnect
    popup.js                Extension popup — live gauge, fatigue label, reset button
  popup.html                Popup UI — anomaly banner, reset session control

sdk/                        TypeScript SDK (@neuroflow/sdk)
  src/
    core/NeuroFlow.ts       Core class — hysteresis SM, predictive adaptation, plugin API
    hooks/useNeuroFlow.ts   React hook wrapper

dashboard/                  React research dashboard
  src/
    components/
      LoadGauge.tsx
      LoadTimeline.tsx
      SignalBreakdown.tsx
      StateDistribution.tsx
      SessionStats.tsx
      SignalMatrix.tsx
      EstimateLog.tsx
      CognitiveFingerprint.tsx
      FlowStreakBanner.tsx
      SessionReplayPlayer.tsx
      CalibrationFlow.tsx
      NBackTask.tsx
      NasaTLX.tsx
      FatigueAlert.tsx      Dismissible fatigue banner with sparkline
    hooks/
      useNeuroFlowSocket.ts
    utils/
      colors.ts

reference-app/              Adaptive code editor
  src/
    hooks/useNeuroFlow.ts   Signal collection, EMA, debounce, watch mode
    components/
      AdaptiveEditor.tsx    CodeMirror 6 — 4 adaptive states, predictive pre-adaptation
      LoadHUD.tsx           Floating HUD — load, forecast, trend arrow, state chip
      SessionReport.tsx     Post-session report card modal
      FlowCelebration.tsx   Particle burst on flow state entry

research/
  training/
    train.py                BiLSTM training pipeline (ONNX export)
    analyze_signals.py      Signal-NASA-TLX correlation analysis
    setup_a100.sh           GPU instance setup
  user-study/
    PROTOCOL.md             Within-subjects study protocol
    analysis.py             Paired t-tests, Cohen's d, statistics
  paper/
    neuroflow_chi2026.md    CHI 2026 paper scaffold

infra/docker/
  docker-compose.yml        Postgres + Redis

.github/workflows/
  ci.yml                    4-job CI — backend, dashboard, reference app, SDK
```

---

## Local development

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set DATABASE_URL and ALLOWED_ORIGINS
uvicorn app.main:app --reload
```

**Dashboard**

```bash
cd dashboard
npm install
npm run dev
```

**Reference app**

```bash
cd reference-app
npm install
npm run dev
```

**Extension**

1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked — select the `extension/` directory

**SDK**

```bash
cd sdk
npm install
npm run build
```

---

## Deployments

| Component | URL | Platform |
|---|---|---|
| Backend API | https://neuroflow-backend-r6rs.onrender.com | Render |
| Research Dashboard | https://neuroflow-dashboard.pages.dev | Cloudflare Pages |
| Reference App | https://neuroflow-editor.pages.dev | Cloudflare Pages |

Auto-deploys on every push to main.

---

## User study

Within-subjects, counterbalanced. N=20 participants. Two conditions: control (adaptation disabled) and NeuroFlow (full adaptation). Task: 35-minute coding task under each condition. Primary measures: NASA-TLX score, task quality rubric. Analysis: paired t-tests, Cohen's d, 95% confidence intervals.

Full protocol in `research/user-study/PROTOCOL.md`.

Publication target: CHI 2026 / UIST 2026. Paper scaffold at `research/paper/neuroflow_chi2026.md`.

---

## Roadmap

### Done

- [x] FastAPI backend with WebSocket inference hub
- [x] Chrome extension — 13-signal behavioral collector, badge, popup
- [x] Heuristic stub — functional end-to-end before LSTM is trained
- [x] TypeScript SDK with CSS custom property adaptation
- [x] Hysteresis state machine — prevents UI state flickering
- [x] Predictive adaptation — pre-adapts based on 6s forecast
- [x] Plugin/observer API — nf.use(plugin)
- [x] React research dashboard — gauge, timeline, signal breakdown
- [x] Calibration UI — N-back tasks, NASA-TLX, CalibrationFlow orchestrator
- [x] Adaptive code editor reference app — 4 states, live HUD
- [x] Backend deployed on Render
- [x] Dashboard and reference app deployed on Cloudflare Pages
- [x] GitHub Actions CI — all 4 components green
- [x] BiLSTM training pipeline — ready for A100
- [x] User study protocol — IRB-ready, analysis scripts
- [x] CHI 2026 paper scaffold
- [x] Postgres persistence — sessions and load estimates
- [x] Session sharing via watch URL
- [x] Post-session report card
- [x] Ctrl+1-4 demo shortcuts with auto-release
- [x] Predictive load regression line on timeline
- [x] Cognitive fingerprint radar chart
- [x] Session replay player with scrubber
- [x] Flow streak celebration banner
- [x] Flow state particle celebration in reference app
- [x] Kalman filter — smooth, low-lag load score
- [x] Welford online baseline — per-session z-score normalization
- [x] Mahalanobis confidence scoring
- [x] Holt-Winters forecaster — 60s ahead with CI bands
- [x] Phase classification — rising / falling / stable / volatile
- [x] Fatigue tracker — exponential decay, 20-min half-life
- [x] Analytics API — summary, peaks, fingerprint, compare
- [x] Rate limiting — 50 signals/s per session
- [x] Exponential backoff reconnect — 1s to 60s cap
- [x] 500-signal offline buffer — flush on reconnect
- [x] 4-color adaptive badge
- [x] Anomaly flash and popup banner in extension
- [x] RESET SESSION in extension popup
- [x] FatigueAlert component in dashboard — 3 severity levels, sparkline
- [x] Multi-tab signal aggregation — recency-weighted merge
- [x] Predictive state HUD in reference app — trend arrow, state chip

### Next

- [ ] Collect 50+ calibration sessions from real users
- [ ] Train and deploy ONNX model — replace heuristic stub
- [ ] Run user study (N=20)
- [ ] Submit to CHI 2026 / UIST 2026
- [ ] Publish @neuroflow/sdk to npm
- [ ] Release labeled calibration dataset

---

## Contributors

- **Aprameya Bharadwaj** — core system architecture, backend inference pipeline, SDK, reference app, research infrastructure
- **Aashritha Teegavarapu** — dashboard components, calibration UI, N-back task, fatigue alert, multi-tab aggregation, extension popup improvements

Built in public. MIT. PRs welcome.

[GitHub](https://github.com/Aprameya05/neuroflow) | [Live Demo](https://neuroflow-editor.pages.dev) | [Dashboard](https://neuroflow-dashboard.pages.dev)
