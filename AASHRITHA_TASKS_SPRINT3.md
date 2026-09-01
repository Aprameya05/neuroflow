# Aashritha's Tasks — Sprint 3
## Goal: Multi-tab intelligence, fatigue UI, and SDK predictive state

This sprint is harder than Sprint 2. Each task is designed to stretch you — read the steps carefully, ask Aprameya if stuck, and open a PR when done. Don't push directly to `main`.

First, pull the latest:
```bash
cd neuroflow
git pull
git checkout -b aashritha/sprint-3
```

---

## Task 1 — Multi-tab signal aggregation in the Chrome extension (2–3 hours)

**Why it matters:** Right now the extension tracks only the active tab. If you have 12 tabs open and you switch between them every 30 seconds, the signal is fragmented — the inference engine sees tab-switch spikes but not *what* those tabs are. This task makes the extension tab-aware.

**What you'll build:** A per-tab signal store in `background.js`. Each tab gets its own signal buffer. When the popup or the backend asks for the "current" state, the background merges signals from all tabs weighted by how recently each tab was active.

**Steps:**

1. Open `extension/src/background.js`. After the `offlineBuffer` declaration, add a per-tab store:
   ```js
   const tabSignals = {};      // tabId → { lastActive: number, signals: [] }
   const TAB_WEIGHT_HALFLIFE = 30_000;  // 30 s: older tabs contribute less
   ```

2. In the `chrome.runtime.onMessage` handler for `"SIGNAL"`, extract the sender's tab ID and store the signal in `tabSignals[tabId]` instead of (or in addition to) forwarding it directly:
   ```js
   if (message.type === "SIGNAL") {
     const tabId = _sender.tab?.id;
     if (tabId != null) {
       if (!tabSignals[tabId]) tabSignals[tabId] = { lastActive: Date.now(), signals: [] };
       tabSignals[tabId].lastActive = Date.now();
       tabSignals[tabId].signals.push(message.payload);
       if (tabSignals[tabId].signals.length > 50) tabSignals[tabId].signals.shift();
     }
     // ... existing WebSocket forward code unchanged
   }
   ```

3. Write a `mergeTabSignals()` function that returns a single merged signal payload. The merge weights each tab's latest signal by `exp(-elapsed_ms / TAB_WEIGHT_HALFLIFE)`. For numeric fields, compute the weighted average. For `url`, use the most-recently-active tab's URL.

4. Add a `"GET_MERGED_SIGNAL"` message type that returns the merged signal. The popup can use this to show "you have signals from N tabs".

5. Clean up stale tabs: in a `chrome.tabs.onRemoved` listener, delete `tabSignals[tabId]`.

6. Test: open 3 tabs, type in each, then open the extension popup and verify the badge reflects merged activity.

**Acceptance criteria:**
- The WebSocket still sends 100 ms signals uninterrupted.
- `GET_MERGED_SIGNAL` returns a valid merged payload.
- No console errors when a tab is closed.

---

## Task 2 — Fatigue Alert component in the dashboard (2–3 hours)

**Why it matters:** The backend now sends a `fatigue_index` (0–1) in every load estimate. The dashboard currently ignores it. This task adds a `FatigueAlert` component that displays a dismissible banner when fatigue accumulates.

**What you'll build:** `dashboard/src/components/FatigueAlert.tsx`

**Steps:**

1. Create `dashboard/src/components/FatigueAlert.tsx`:

```tsx
import { useState, useEffect } from "react";

interface FatigueAlertProps {
  fatigueIndex: number;   // 0.0–1.0 from backend
  sessionMinutes: number; // elapsed session time
}

const THRESHOLDS = [
  { level: 0.3, msg: "You've been focused for a while. Consider a 5-minute break.", color: "#fef3c7", border: "#f59e0b" },
  { level: 0.6, msg: "Fatigue detected. A short walk or rest will restore focus.", color: "#fee2e2", border: "#ef4444" },
  { level: 0.8, msg: "High cognitive fatigue. Taking a break now will improve output quality.", color: "#fecaca", border: "#dc2626" },
];

export function FatigueAlert({ fatigueIndex, sessionMinutes }: FatigueAlertProps) {
  const [dismissed, setDismissed] = useState<number | null>(null);

  const threshold = [...THRESHOLDS].reverse().find(t => fatigueIndex >= t.level);
  if (!threshold) return null;
  if (dismissed === threshold.level) return null;

  return (
    <div style={{
      background: threshold.color,
      border: `1px solid ${threshold.border}`,
      borderRadius: 10,
      padding: "12px 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      marginBottom: 16,
    }}>
      <div>
        <span style={{ fontSize: 18, marginRight: 8 }}>
          {fatigueIndex >= 0.8 ? "🔴" : fatigueIndex >= 0.6 ? "🟠" : "🟡"}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: "#1f2937" }}>
          {threshold.msg}
        </span>
        <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 8 }}>
          Session: {sessionMinutes} min · Fatigue: {Math.round(fatigueIndex * 100)}%
        </span>
      </div>
      <button
        onClick={() => setDismissed(threshold.level)}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: 18,
          color: "#6b7280",
          flexShrink: 0,
        }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
```

2. In `dashboard/src/App.tsx`, import and render the component. You need to:
   - Track `fatigueIndex` from incoming estimates: `const [fatigueIndex, setFatigueIndex] = useState(0);`
   - In the WebSocket message handler where you process `load_estimate`, add: `if (data.fatigue_index != null) setFatigueIndex(data.fatigue_index);`
   - Track session start time: `const sessionStartRef = useRef(Date.now());`
   - Compute `sessionMinutes`: `Math.floor((Date.now() - sessionStartRef.current) / 60_000)`
   - Render `<FatigueAlert fatigueIndex={fatigueIndex} sessionMinutes={sessionMinutes} />` above the main grid.

3. Make the dismissal reset when fatigue drops back below the threshold. Hint: add a `useEffect` that watches `fatigueIndex` and calls `setDismissed(null)` when it drops below `dismissed - 0.1`.

4. Add a `FatigueTimeline` mini-chart below the alert that shows the last 30 fatigue readings as a thin area chart (reuse Recharts — you already have it installed). The chart should be 60 px tall, no axes, just the area shape.

**Acceptance criteria:**
- Alert appears when `fatigue_index` exceeds each threshold.
- Dismissing hides it until fatigue drops and rises again.
- No TypeScript errors (`npm run build` passes).

---

## Task 3 — Predictive State Indicator in the reference app (2–3 hours)

**Why it matters:** The backend now sends a `forecast` object with `load_6s` (predicted load 6 seconds ahead) and `phase` ("rising" | "falling" | "stable" | "volatile"). The reference app's HUD shows current load but ignores the forecast. This task makes the HUD predictive.

**What you'll build:** Upgrade `reference-app/src/components/LoadHUD.tsx` to show a directional arrow and the predicted state.

**Steps:**

1. Open `reference-app/src/hooks/useNeuroFlow.ts`. Find where the WebSocket message is parsed and the load estimate extracted. After extracting `load`, also extract:
   ```ts
   const forecast = data.forecast ?? null;
   const fatigueIndex = data.fatigue_index ?? 0;
   const isAnomaly = data.is_anomaly ?? false;
   ```
   Return these from the hook alongside `load`.

2. Open `reference-app/src/components/LoadHUD.tsx`. The HUD currently shows a number and a gauge bar. Add:

   **Trend arrow** — render ↑ (rising), ↓ (falling), → (stable), or ⚡ (volatile) based on `forecast.phase`. Colour: red for rising/volatile, green for falling, grey for stable.

   **Predicted state chip** — show what state the UI will be in 6 s:
   ```tsx
   const predictedState = forecast?.load_6s != null
     ? (forecast.load_6s < 0.21 ? "rich" : forecast.load_6s < 0.35 ? "normal" : forecast.load_6s < 0.65 ? "reduced" : "minimal")
     : null;
   ```
   Render it as a small pill beside the current state chip: `"→ reduced in 6s"`.

   **Anomaly pulse** — when `isAnomaly` is true, add a red pulsing ring around the HUD (CSS `@keyframes pulse` animation with box-shadow).

   **Fatigue bar** — add a thin horizontal bar below the load bar that fills with `fatigueIndex` and is coloured from green → yellow → red.

3. Make sure the HUD doesn't crash when `forecast` is null (demo mode with no extension connected).

**Acceptance criteria:**
- Trend arrow updates every second without flickering.
- Predicted state chip shows a sensible value in demo mode (use the demo random walk's trajectory).
- Anomaly pulse appears when `is_anomaly` is true and disappears within 2 s.
- `npm run build` passes in the reference-app directory.

---

## Task 4 — Anomaly notification in the extension popup (1–2 hours)

**Why it matters:** The extension popup is the user's window into their cognitive state. Right now it shows a static gauge. This task adds a live anomaly notification: when `is_anomaly` is true, a banner appears in the popup.

**What you'll build:** Upgrade `extension/popup.html` and `extension/src/popup.js`.

**Steps:**

1. In `extension/popup.html`, add an anomaly banner div above the gauge:
   ```html
   <div id="anomaly-banner" style="display:none; background:#fef2f2; border:1px solid #ef4444; border-radius:6px; padding:8px 12px; margin-bottom:12px; font-size:12px; color:#b91c1c;">
     ⚡ Load spike detected — consider pausing.
   </div>
   ```

2. In `extension/src/popup.js`, when reading `nf_latest` from `chrome.storage.local`:
   ```js
   chrome.storage.local.get(["nf_latest"], ({ nf_latest }) => {
     if (!nf_latest) return;
     // ... existing gauge update code ...
     const banner = document.getElementById("anomaly-banner");
     banner.style.display = nf_latest.is_anomaly ? "block" : "none";
     // also show fatigue
     if (nf_latest.fatigue_index != null) {
       document.getElementById("fatigue-label").textContent =
         `Fatigue: ${Math.round(nf_latest.fatigue_index * 100)}%`;
     }
   });
   ```

3. Add a `<p id="fatigue-label" style="font-size:11px;color:#6b7280;margin:4px 0 0;">Fatigue: —</p>` to the popup HTML below the gauge.

4. Add a `RESET_SESSION` button to the popup that sends `{ type: "RESET_SESSION" }` to `background.js`. This lets the user start a fresh session without reloading the extension.

**Acceptance criteria:**
- Anomaly banner appears and disappears correctly.
- Fatigue label updates on every popup open.
- Reset button creates a new session ID and clears the offline buffer.
- No broken styles (popup is still 280 px wide max).

---

## Push your work

```bash
git add .
git commit -m "feat(sprint-3): multi-tab aggregation, fatigue alert, predictive HUD, anomaly popup"
git push --set-upstream origin aashritha/sprint-3
```

Then open a pull request from `aashritha/sprint-3` → `main`.

---

## Questions?
Open a GitHub issue or message Aprameya. Don't guess on the TypeScript types — check `dashboard/src/types.ts` and the `LoadEstimate` interface in `sdk/src/core/NeuroFlow.ts`.
