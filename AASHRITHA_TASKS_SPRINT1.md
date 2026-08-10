# Aashritha's Tasks — Sprint 1
## Goal: Get the dashboard running and showing live data

Hi Aashritha! Welcome to NeuroFlow. This document tells you exactly what to do in Sprint 1.
The code is already written for you — your job is to get it running, understand it, and extend it.

---

## What you're building
The **research dashboard** — a live visualization of a user's cognitive load in real time.
It connects to the backend via WebSocket and shows a gauge, a timeline chart, and a signal breakdown.

---

### Task 1: Accept the GitHub collaborator invite
Check your email or github.com/notifications for the invite link. Accept it, then:

```bash
git clone https://github.com/THEIR_USERNAME/neuroflow.git
cd neuroflow
```

---

### Task 2: Run the dashboard

```bash
cd dashboard
npm install
npm run dev
```

Open http://localhost:5173 — you should see the NeuroFlow dashboard.

It will show "Not connected" until the backend is running (your partner does that part).
Once both are running, you should see the "Live" badge turn green and data appear.

---

### Task 3: Understand what you're looking at

Open `dashboard/src/` — here's what each file does:

```
src/
  App.tsx                        ← main page layout, you'll edit this often
  types.ts                       ← shared data types (what a "load estimate" looks like)
  hooks/
    useNeuroFlowSocket.ts        ← connects to WebSocket, stores incoming estimates
  components/
    LoadGauge.tsx                ← the semicircular gauge (green/amber/red)
    LoadTimeline.tsx             ← the line chart showing load over time
    SignalBreakdown.tsx          ← which behavioral signal is driving the estimate
```

Read each file top-to-bottom. They have comments explaining what each piece does.

---

### Task 4: Make the gauge animate nicely

Open `LoadGauge.tsx`. Find the `style` prop on the filled arc path.
The transition is currently `0.5s ease`. Try changing it to different values:
- `0.2s ease` — snappier
- `1s cubic-bezier(0.34, 1.56, 0.64, 1)` — bouncy

Pick what looks best for a "live monitoring" feel.

---

### Task 5: Add a "UI State" indicator to the dashboard

The backend sends a `load` score (0–1). The SDK converts this to a UI state:
- `rich` — load < 21%
- `normal` — load 21–30%
- `reduced` — load 30–65%
- `minimal` — load > 65%

Add a component to `App.tsx` that shows the current UI state as a colored badge.

Here is the starter code — add this to `App.tsx` after the stats cards:

```tsx
function UIStateBadge({ load }: { load: number | null }) {
  if (load === null) return null;

  const state =
    load < 0.21 ? "rich" :
    load < 0.30 ? "normal" :
    load < 0.65 ? "reduced" : "minimal";

  const colors: Record<string, { bg: string; text: string; label: string }> = {
    rich:    { bg: "#dcfce7", text: "#15803d", label: "Rich UI — showing all features" },
    normal:  { bg: "#eff6ff", text: "#1d4ed8", label: "Normal UI" },
    reduced: { bg: "#fef9c3", text: "#854d0e", label: "Reduced UI — simplifying" },
    minimal: { bg: "#fef2f2", text: "#b91c1c", label: "Minimal UI — emergency simplification" },
  };

  const c = colors[state];
  return (
    <div style={{ background: c.bg, color: c.text, padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500 }}>
      UI state: <strong>{state}</strong> — {c.label}
    </div>
  );
}
```

Then use it in the `App` function:
```tsx
<UIStateBadge load={currentLoad} />
```

---

### Task 6: Add a "session recording" log panel

Add a simple scrollable list that shows the last 10 estimates received.
This helps during development to verify data is flowing correctly.

Create a new file `dashboard/src/components/EstimateLog.tsx`:

```tsx
import type { LoadEstimate } from "../types";

export function EstimateLog({ estimates }: { estimates: LoadEstimate[] }) {
  const recent = [...estimates].reverse().slice(0, 10);
  return (
    <div style={{ fontFamily: "monospace", fontSize: 11, color: "#6b7280" }}>
      {recent.map((e, i) => (
        <div key={i} style={{ padding: "3px 0", borderBottom: "1px solid #f3f4f6" }}>
          {new Date(e.ts).toLocaleTimeString()} &nbsp;
          load={Math.round(e.load * 100)}% &nbsp;
          conf={Math.round(e.confidence * 100)}% &nbsp;
          ↑{e.dominant}
        </div>
      ))}
    </div>
  );
}
```

Import and add it to `App.tsx` below the timeline card.

---

### When you're done with Sprint 1, open a PR titled:
`feat: Sprint 1 — dashboard running with gauge, timeline, signal breakdown`

---

## Quick reference — the data flowing through the system

```
Browser behavior
  → [SDK/extension collects: keystrokes, mouse, scroll, errors]
  → WebSocket to backend (every 100ms)
  → Backend ML inference runs
  → WebSocket back to dashboard: { load: 0.47, confidence: 0.8, dominant: "error_rate" }
  → Dashboard updates gauge, chart, breakdown
```

The `load` number is the core of everything. 0 = fully focused, calm. 1 = overwhelmed.

---

## Questions?
Ping your partner or open a GitHub issue tagged `question`.
