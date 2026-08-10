# Aashritha's Tasks -- Sprint 2
## Goal: Make the dashboard more powerful

First, pull the latest code:
```
cd neuroflow
git pull
cd dashboard
npm install
npm run dev
```

---

### Task 1 -- Add the UI State badge (45 mins)

The backend sends a load score between 0 and 1. We convert this into 4 discrete states:
- `rich` -- load below 21%, user is in deep focus, show everything
- `normal` -- load 21-30%, standard interface
- `reduced` -- load 30-65%, simplify the interface
- `minimal` -- load above 65%, emergency focus mode

Open `dashboard/src/App.tsx` and add this component above the `App` function:

```tsx
function UIStateBadge({ load }: { load: number | null }) {
  if (load === null) return null;

  const state =
    load < 0.21 ? "rich" :
    load < 0.30 ? "normal" :
    load < 0.65 ? "reduced" : "minimal";

  const styles = {
    rich:    { bg: "#dcfce7", text: "#15803d", label: "Rich UI -- all features visible" },
    normal:  { bg: "#eff6ff", text: "#1d4ed8", label: "Normal UI" },
    reduced: { bg: "#fef9c3", text: "#854d0e", label: "Reduced UI -- simplifying interface" },
    minimal: { bg: "#fef2f2", text: "#b91c1c", label: "Minimal UI -- focus mode active" },
  };

  const s = styles[state];
  return (
    <div style={{
      background: s.bg, color: s.text,
      padding: "10px 16px", borderRadius: 8,
      fontSize: 13, fontWeight: 500, marginTop: 16
    }}>
      Current state: <strong>{state}</strong> -- {s.label}
    </div>
  );
}
```

Then find where the stats cards are in the `App` function and add this below them:

```tsx
<UIStateBadge load={currentLoad} />
```

---

### Task 2 -- Add an estimate log (45 mins)

Create a new file `dashboard/src/components/EstimateLog.tsx`:

```tsx
import type { LoadEstimate } from "../types";

export function EstimateLog({ estimates }: { estimates: LoadEstimate[] }) {
  const recent = [...estimates].reverse().slice(0, 12);

  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb",
      borderRadius: 12, padding: "18px 22px"
    }}>
      <p style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 500, color: "#374151" }}>
        Live estimate log
      </p>
      <div style={{ fontFamily: "monospace", fontSize: 11, color: "#6b7280" }}>
        {recent.length === 0 && (
          <p style={{ color: "#9ca3af" }}>Waiting for data...</p>
        )}
        {recent.map((e, i) => (
          <div key={i} style={{
            padding: "4px 0",
            borderBottom: "1px solid #f3f4f6",
            display: "flex", gap: 12
          }}>
            <span style={{ color: "#9ca3af" }}>
              {new Date(e.ts).toLocaleTimeString()}
            </span>
            <span style={{
              fontWeight: 600,
              color: e.load > 0.65 ? "#ef4444" : e.load > 0.3 ? "#f59e0b" : "#22c55e"
            }}>
              {Math.round(e.load * 100)}%
            </span>
            <span>{e.dominant}</span>
            <span style={{ color: "#d1d5db" }}>
              conf {Math.round(e.confidence * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Then in `App.tsx` add this import at the top:
```tsx
import { EstimateLog } from "./components/EstimateLog";
```

And add it below the timeline/breakdown row:
```tsx
<div style={{ marginTop: 18 }}>
  <EstimateLog estimates={estimates} />
</div>
```

---

### Task 3 -- Add CSV export (30 mins)

In `App.tsx`, add this function inside the `App` component:

```tsx
function exportCSV(estimates: LoadEstimate[]) {
  const header = "timestamp,load,confidence,dominant\n";
  const rows = estimates.map(e =>
    `${new Date(e.ts).toISOString()},${e.load},${e.confidence},${e.dominant}`
  ).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "neuroflow-session.csv";
  a.click();
  URL.revokeObjectURL(url);
}
```

Add this button in the header area next to the status badge:

```tsx
<button
  onClick={() => exportCSV(estimates)}
  disabled={estimates.length === 0}
  style={{
    fontSize: 12, padding: "6px 14px",
    borderRadius: 6, border: "1px solid #e5e7eb",
    background: "#fff", cursor: "pointer",
    opacity: estimates.length === 0 ? 0.4 : 1
  }}
>
  Export CSV
</button>
```

---

### Task 4 -- Push your work (15 mins)

```
git add .
git commit -m "feat: Sprint 2 -- UI state badge, estimate log, CSV export"
git push
```

---

### Task 5 -- If you finish early, start Sprint 3

Build the N-back task UI. This is the calibration interface that will generate our model training data -- it is one of the most important pieces of the project.

Create `dashboard/src/components/NBackTask.tsx`:

```tsx
import { useState, useEffect, useRef } from "react";

interface NBackTaskProps {
  n?: number;           // 1, 2, or 3
  onComplete?: (results: TaskResult[]) => void;
}

interface TaskResult {
  stimulus: number;
  userResponse: boolean | null;   // true = match, false = no match, null = no response
  correct: boolean;
  reactionTimeMs: number | null;
}

const TOTAL_TRIALS = 20;
const STIMULUS_DURATION_MS = 500;
const INTER_STIMULUS_MS = 2000;

export function NBackTask({ n = 2, onComplete }: NBackTaskProps) {
  const [phase, setPhase] = useState<"intro" | "running" | "done">("intro");
  const [stimuli, setStimuli] = useState<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [showStimulus, setShowStimulus] = useState(false);
  const [results, setResults] = useState<TaskResult[]>([]);
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const stimulusStart = useRef<number>(0);

  function generateStimuli(count: number): number[] {
    const seq: number[] = [];
    for (let i = 0; i < count; i++) {
      if (i >= n && Math.random() < 0.3) {
        seq.push(seq[i - n]);   // 30% chance of a match
      } else {
        seq.push(Math.floor(Math.random() * 9) + 1);
      }
    }
    return seq;
  }

  function start() {
    const seq = generateStimuli(TOTAL_TRIALS);
    setStimuli(seq);
    setCurrentIndex(0);
    setResults([]);
    setPhase("running");
  }

  function handleResponse(isMatch: boolean) {
    if (!waitingForResponse || currentIndex < n) return;
    const rt = Date.now() - stimulusStart.current;
    const actualMatch = stimuli[currentIndex] === stimuli[currentIndex - n];
    setResults(prev => [...prev, {
      stimulus: stimuli[currentIndex],
      userResponse: isMatch,
      correct: isMatch === actualMatch,
      reactionTimeMs: rt,
    }]);
    setWaitingForResponse(false);
  }

  useEffect(() => {
    if (phase !== "running") return;
    if (currentIndex >= TOTAL_TRIALS) {
      setPhase("done");
      onComplete?.(results);
      return;
    }

    setShowStimulus(true);
    stimulusStart.current = Date.now();
    setWaitingForResponse(currentIndex >= n);

    const hideTimer = setTimeout(() => setShowStimulus(false), STIMULUS_DURATION_MS);
    const nextTimer = setTimeout(() => setCurrentIndex(i => i + 1), INTER_STIMULUS_MS);

    return () => { clearTimeout(hideTimer); clearTimeout(nextTimer); };
  }, [currentIndex, phase]);

  const accuracy = results.length > 0
    ? Math.round((results.filter(r => r.correct).length / results.length) * 100)
    : 0;

  if (phase === "intro") {
    return (
      <div style={{ textAlign: "center", padding: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>{n}-Back Task</h2>
        <p style={{ color: "#6b7280", marginBottom: 8, maxWidth: 400, margin: "0 auto 24px" }}>
          You will see a sequence of numbers. Press <strong>Match</strong> if the current number
          is the same as the one shown <strong>{n} step{n > 1 ? "s" : ""} ago</strong>.
          Otherwise press <strong>No Match</strong>.
        </p>
        <button
          onClick={start}
          style={{ padding: "10px 28px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer", fontWeight: 500 }}
        >
          Start
        </button>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div style={{ textAlign: "center", padding: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Task complete</h2>
        <p style={{ fontSize: 32, fontWeight: 700, color: "#6366f1", marginBottom: 8 }}>{accuracy}%</p>
        <p style={{ color: "#6b7280", marginBottom: 24 }}>accuracy across {results.length} trials</p>
        <button
          onClick={start}
          style={{ padding: "10px 28px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer" }}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", padding: 40 }}>
      <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 32 }}>
        Trial {currentIndex + 1} of {TOTAL_TRIALS} -- {n}-back
      </p>

      <div style={{
        width: 120, height: 120, borderRadius: 16,
        background: showStimulus ? "#6366f1" : "#f3f4f6",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 40px",
        transition: "background 0.1s",
      }}>
        <span style={{ fontSize: 48, fontWeight: 700, color: showStimulus ? "#fff" : "transparent" }}>
          {stimuli[currentIndex]}
        </span>
      </div>

      <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
        <button
          onClick={() => handleResponse(true)}
          disabled={!waitingForResponse}
          style={{ padding: "12px 32px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, cursor: waitingForResponse ? "pointer" : "not-allowed", opacity: waitingForResponse ? 1 : 0.3, fontWeight: 500 }}
        >
          Match
        </button>
        <button
          onClick={() => handleResponse(false)}
          disabled={!waitingForResponse}
          style={{ padding: "12px 32px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, cursor: waitingForResponse ? "pointer" : "not-allowed", opacity: waitingForResponse ? 1 : 0.3, fontWeight: 500 }}
        >
          No Match
        </button>
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: "#9ca3af" }}>
        {currentIndex < n ? "Watch the sequence..." : waitingForResponse ? "Respond now" : ""}
      </p>
    </div>
  );
}
```

To test it, temporarily add this to `App.tsx`:
```tsx
import { NBackTask } from "./components/NBackTask";
// then somewhere in the JSX:
<NBackTask n={2} onComplete={(results) => console.log(results)} />
```

This is the core of our calibration protocol. When it is wired to the backend it will generate the training data for the ML model.

---

### Questions?
Open a GitHub issue or message Aprameya. Everything you build goes into a PR -- don't push directly to main.
