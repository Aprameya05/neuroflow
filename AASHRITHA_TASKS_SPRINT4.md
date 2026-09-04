# Aashritha's Tasks — Sprint 4
## Goal: Session heatmap calendar, signal correlation matrix, intervention toasts, and behavioural archetype clustering

Sprint 4 is the most ambitious yet. You're building four substantial features: two new dashboard views, a smart intervention system, and an ML-adjacent clustering component. Each task has everything you need — read the steps, look at what Aprameya has already built in the backend and SDK (new v2.1 endpoints!), and don't rush. Quality over speed.

Pull the latest before starting anything:
```bash
cd neuroflow
git pull
git checkout -b aashritha/sprint-4
```

---

## Task 1 — Session Heatmap Calendar in the Dashboard (3–4 hours)

**Why it matters:** Right now the dashboard shows a single session in real time. There's no way to compare "how was my Tuesday at 9 am vs the same slot last week?" A session heatmap calendar — like GitHub's contribution graph, but showing cognitive load instead of commit count — gives users a bird's-eye view of their cognitive patterns over weeks and months.

**What you'll build:** A calendar grid in `dashboard/src/components/SessionCalendar.tsx` where each cell is a day, the cell colour encodes that day's average cognitive load, and hovering a cell shows a mini summary (session count, avg load, flow time). Clicking a cell navigates to that session's detail.

**API you'll use:** `GET /api/analytics/users/{user_id}/fingerprint` already returns session data. The backend will add a `/api/analytics/users/{user_id}/sessions_by_day` endpoint — for now, use the existing data and simulate the calendar structure.

**Steps:**

1. Create `dashboard/src/components/SessionCalendar.tsx`. Start with the type definitions:
   ```tsx
   interface DayCell {
     date: string;         // ISO "YYYY-MM-DD"
     sessionCount: number;
     avgLoad: number;      // 0–1, used for colour encoding
     flowFraction: number; // fraction of time in flow state
     sessionIds: string[];
   }
   ```

2. Build a `buildCalendarGrid` function that takes an array of `DayCell` and returns a 52-week × 7-day grid. Weeks run left-to-right (oldest to newest), days run top-to-bottom (Mon → Sun). Pad the start with empty cells to align the first day of the dataset to the correct weekday.

3. Render the grid as an SVG (or a `div` grid with `display: grid`). Each cell is 14×14 px with 2 px gap. Colour each cell using a 5-stop scale:
   - Empty (no sessions): `#1a1f2e`
   - Load 0–0.20 (rich/flow): `#6366f1`   ← indigo
   - Load 0.20–0.35 (normal): `#22c55e`   ← green
   - Load 0.35–0.65 (reduced): `#f59e0b`  ← amber
   - Load 0.65–1.00 (overload): `#ef4444` ← red

4. Add a tooltip on hover. Use a `useState` for `hoveredCell` and render an absolutely-positioned tooltip card showing: date, session count, average load %, flow fraction %, and a mini bar chart of load distribution across the 4 states.

5. Add a month-label row above the grid. Compute the first cell of each month and render the short month name (`Jan`, `Feb`, …) above it.

6. Add a legend row below the grid: "Less" → five colour swatches → "More", and a note "colour = avg cognitive load". Keep it small and right-aligned.

7. Wire it into `dashboard/src/App.tsx`. Add a `"calendar"` tab alongside the existing session view. When no `user_id` is available, show placeholder cells at 50% opacity with a "connect to see your history" message.

8. **Fetch real data.** Call `GET /api/analytics/users/{userId}/fingerprint` to get the list of sessions, then for each session call `/api/analytics/sessions/{id}/summary` and build `DayCell` objects from the results. Throttle requests: fetch sessions in batches of 5 with `Promise.all`, not all at once.

**Acceptance criteria:**
- Grid renders 52 weeks with correct weekday alignment.
- Hover tooltip shows correct data for that cell.
- Colour encoding is accurate (matches the 4-state palette).
- Works with 0 sessions (empty state with helpful message).

---

## Task 2 — Signal Correlation Matrix Visualisation (2–3 hours)

**Why it matters:** The backend now exposes a `/api/analytics/sessions/{session_id}/correlations` endpoint that returns the Pearson r between each behavioural signal and the load score. Visualising this as a heatmap matrix gives users genuine insight into *which signals drive their cognitive load* — a level of introspection no mainstream tool offers.

**What you'll build:** A `CorrelationMatrix` component in `dashboard/src/components/CorrelationMatrix.tsx` that fetches the correlations endpoint and renders a ranked bar chart + a colour-coded signal table.

**Steps:**

1. Create `dashboard/src/components/CorrelationMatrix.tsx`. Define the prop type:
   ```tsx
   interface Props {
     sessionId: string;
   }
   ```

2. On mount, fetch `GET /api/analytics/sessions/${sessionId}/correlations`. Store the result in local state. Handle loading and error states with skeleton loaders (grey rounded rects at the right sizes — no spinners).

3. Render a horizontal ranked bar chart (using Recharts `BarChart` with `layout="vertical"`). Each row is a signal. Bar length = `|pearson_r|`. Bar colour:
   - r > 0.4: `#ef4444` (strong positive — signal correlates strongly with high load)
   - r 0.15–0.4: `#f59e0b` (moderate positive)
   - r -0.15–0.15: `#64748b` (neutral)
   - r < -0.15: `#22c55e` (negative — signal correlates with low load / flow)

4. Below the chart, render a signal explanation table. Each row: signal name, readable description, Pearson r value, and a short interpretation sentence. Write the descriptions from scratch — e.g. `error_rate` → "Backspace / Delete key frequency — rises when typing under pressure or uncertainty."

5. Add a section header "What drove your load this session" with a one-sentence natural-language summary computed from the data, e.g. "Your main load signal was error rate (r = +0.71), suggesting typing pressure was the primary cognitive driver."

6. Wire into `App.tsx`: show this component in the session detail view, below the existing charts, only when a `sessionId` is available.

**Acceptance criteria:**
- Fetches and renders correlations for the active session.
- Bar colours match the r-value scale.
- Natural-language summary is grammatically correct and data-driven (not hard-coded).
- Empty/loading/error states all handled.

---

## Task 3 — Intervention Toast System (3–4 hours)

**Why it matters:** Detecting that a user is overloaded is only half the job. The other half is *doing something about it*. This task builds a smart intervention system that fires contextual, actionable toasts when the system detects overload, prolonged high-load, or elevated fatigue — and learns which interventions the user responds to.

**What you'll build:** A `InterventionManager` in `dashboard/src/components/InterventionManager.tsx` that subscribes to the NeuroFlow load stream and triggers toasts with evidence-based micro-interventions.

**Steps:**

1. Define an intervention schema:
   ```ts
   interface Intervention {
     id: string;
     trigger: "overload_peak" | "sustained_high" | "fatigue_spike" | "flow_break";
     title: string;
     body: string;
     action?: { label: string; onClick: () => void };
     severity: "low" | "medium" | "high";
     cooldownMs: number;  // don't re-fire within this window
   }
   ```

2. Write a bank of 12 interventions (3 per trigger type). Make them specific and research-grounded:
   - `overload_peak`: "Try the 2-minute rule — finish one small thing completely before continuing." / "Your error rate just spiked. Step back: what do you actually need right now?" / "Load spike detected. Close one unnecessary browser tab."
   - `sustained_high`: "You've been in high load for 8+ minutes. Stand up, walk 30 seconds." / "Sustained overload. Break the current task into two smaller pieces." / "Consider the Pomodoro boundary — is a 5-minute break due?"
   - `fatigue_spike`: "Fatigue index is climbing. A 10-minute break now saves 30 minutes of degraded performance." / "Your behavioural baseline is shifting — classic late-session fatigue. Hydrate." / "Fatigue detected. Your next task would benefit from being your simplest one."
   - `flow_break`: "Flow state interrupted. Give it 90 seconds before switching tasks — don't let the interruption compound." / "You were in flow. Try to re-enter: close notifications, set a 15-minute focus block." / "Post-flow recovery: the next 2 minutes of seeming unproductivity are normal."

3. In the component, subscribe to load/fatigue via props (`load: number`, `fatigueIndex: number`, `inFlowEpisode: boolean`, `isAnomaly: boolean`). Keep a `Map<string, number>` of `lastFiredAt` per intervention ID.

4. Use a `useEffect` that evaluates triggers on every new estimate:
   - `overload_peak`: `isAnomaly === true && load > 0.70`
   - `sustained_high`: a rolling counter of consecutive `load > 0.55` estimates > 80 (8 seconds at 100 ms)
   - `fatigue_spike`: `fatigueIndex` crosses 0.60 from below
   - `flow_break`: `inFlowEpisode` transitions from `true` to `false`

   When a trigger fires, pick the intervention with the lowest `lastFiredAt` (least-recently-shown) to avoid repetition. Check `cooldownMs` before firing.

5. Render toasts as an absolutely-positioned stack in the bottom-right corner. Each toast:
   - Slides in from the right (`transform: translateX(...)` transition on mount).
   - Has a coloured left border (severity colours: low = indigo, medium = amber, high = red).
   - Title, body text, optional action button, and an "×" dismiss button.
   - Auto-dismisses after 12 seconds with a shrinking progress bar at the bottom.
   - Maximum 2 toasts visible at once; queue the rest.

6. Track which interventions the user dismisses vs acts on in `localStorage` keyed by intervention ID. After 5 dismissals of the same intervention, stop showing it (the user has seen it enough). After 3 action clicks, promote it to a "favourite" (show it first in priority).

7. Export a `useInterventionManager` hook that wraps the logic and can be consumed by `App.tsx` cleanly.

**Acceptance criteria:**
- All 4 trigger types fire correctly with correct conditions.
- Cooldown prevents immediate re-firing.
- Toast stack renders correctly (max 2 visible, queue the rest).
- Auto-dismiss timer with progress bar works.
- localStorage tracking of dismiss/action counts is functional.

---

## Task 4 — Behavioural Archetype Clustering (4–5 hours)

**Why it matters:** Different people have fundamentally different cognitive profiles. A "sprinter" works in intense bursts with high peaks and fast recovery. A "marathon runner" sustains moderate load for hours. A "reactive worker" has erratic load tied to interruptions. Clustering users into archetypes — and telling them which archetype they are — is genuinely novel HCI research territory and will be the most impressive feature in the demo.

**What you'll build:** A `ArchetypeCard` component backed by a simple k-means-style clustering algorithm that runs in the browser using the user's fingerprint data.

**Steps:**

1. Define 4 archetypes. Give each a name, description, icon (emoji), characteristic signals, and a recommended workflow strategy:
   ```ts
   const ARCHETYPES = [
     {
       id: "sprinter",
       name: "Sprinter",
       icon: "⚡",
       description: "Works in intense, short bursts. High peak load, fast recovery. Context-switching is your enemy.",
       signals: { peak_load: "high", volatility: "high", flow_index: "low", avg_load: "moderate" },
       strategy: "Use strict time-boxes (25 min max). Turn off notifications during work blocks.",
     },
     {
       id: "marathon",
       name: "Marathon Runner",
       icon: "🏃",
       description: "Sustains steady moderate load for long sessions. Rarely peaks. Fatigue accumulates silently.",
       signals: { peak_load: "low", volatility: "low", flow_index: "moderate", avg_load: "moderate" },
       strategy: "Schedule mandatory breaks every 90 min. Fatigue creep is your main risk.",
     },
     {
       id: "deep-worker",
       name: "Deep Worker",
       icon: "🌊",
       description: "Reaches deep flow states frequently. Long low-load stretches punctuated by sharp overload when interrupted.",
       signals: { peak_load: "high", volatility: "moderate", flow_index: "high", avg_load: "low" },
       strategy: "Protect your flow windows fiercely. Batch all communication to non-peak hours.",
     },
     {
       id: "reactive",
       name: "Reactive Processor",
       icon: "🔔",
       description: "Highly interruption-driven. Load tracks external events more than internal task difficulty.",
       signals: { peak_load: "moderate", volatility: "high", flow_index: "low", avg_load: "high" },
       strategy: "Identify your 2 peak interruption hours and block them. Use async communication where possible.",
     },
   ];
   ```

2. Write a `classifyArchetype` function that takes a user's fingerprint data (from the `/fingerprint` endpoint plus session summaries) and returns the best-matching archetype ID. Use Euclidean distance in a normalised feature space:
   - Features: `avg_load`, `peak_load`, `volatility`, `flow_index`, `peak_count_per_session`
   - Each archetype has a centroid defined by its `signals` descriptors mapped to numeric ranges:
     - "low" → 0.20, "moderate" → 0.45, "high" → 0.75
   - Normalise each feature to [0, 1] across the 4 centroids before computing distance.
   - Return the archetype with the minimum distance.

3. Add a confidence score: `1 - (minDistance / maxDistance)` across the 4 archetypes. This tells the user how clearly they fit the archetype vs being a blend.

4. Create `dashboard/src/components/ArchetypeCard.tsx`. It should:
   - Show the archetype icon (large, ~48px), name, and description.
   - Show a radar chart (use Recharts `RadarChart`) with 5 axes: avg load, peak load, volatility, flow index, peak frequency. Plot the user's actual values alongside the archetype centroid as a reference (two filled polygons, different colours).
   - Show the confidence score as a percentage: "92% match" with a filled arc progress indicator.
   - Show the "Strategy" recommendation with a lightbulb icon.
   - Show which archetype the user is *least* like with a short note: "Unlike the Sprinter, your peaks are infrequent and recovery is slow."

5. Below the card, add a 2×2 grid of all 4 archetype tiles. The user's archetype is highlighted; the others are dimmed (50% opacity). Each tile shows the emoji, name, and one characteristic signal.

6. Wire into `App.tsx` as a new tab "Profile". Fetch the fingerprint and session summaries, run `classifyArchetype`, and render the component. If fewer than 3 sessions exist, show a "keep using NeuroFlow to unlock your archetype" placeholder.

**Acceptance criteria:**
- `classifyArchetype` returns a deterministic result for known input.
- Radar chart renders both the user's data and the archetype centroid correctly.
- Confidence score is computed and displayed.
- Strategy text is readable and matches the correct archetype.
- The 2×2 grid shows all 4 archetypes with the user's highlighted.
- Graceful placeholder for < 3 sessions.

---

## When you're done

Commit everything on your branch:
```bash
git add -A
git commit -m "feat(dashboard): Sprint 4 — session calendar, correlation matrix, intervention toasts, archetype clustering"
git push origin aashritha/sprint-4
```

Open a pull request against `main` and tag Aprameya for review. Put screenshots or a short Loom in the PR description showing each feature working.

Good luck — this sprint is genuinely hard and the output will be genuinely impressive.
