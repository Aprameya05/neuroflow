# NeuroFlow -- Aashritha Sprint Guide

This document is written for you specifically. Each sprint has a clear goal, every step is numbered, and nothing is assumed. If you get stuck on any step, the context section explains what's happening and why.

---

## Before you start

Open a terminal and make sure you have the latest code:

```bash
git checkout main
git pull origin main
npm install   # run inside dashboard/ and reference-app/ separately
```

Check that CI is green at https://github.com/Aprameya05/neuroflow/actions before you start any sprint. Never merge with a red CI.

---

## Sprint 3: Wire the calibration page to the real backend

**Goal:** The calibration UI exists and runs in the browser. Right now, submitting the form hits a hardcoded API call that may or may not work depending on whether the backend is up. This sprint makes the calibration flow fully reliable -- handles network errors gracefully, shows real feedback, and stores results in the database.

**Files you will touch:**
- `dashboard/src/components/CalibrationFlow.tsx`
- `backend/app/api/calibration.py`

**Context:** The calibration flow runs three rounds of N-back tasks followed by NASA-TLX forms. After all three rounds, `CalibrationFlow.tsx` calls `submitCalibration()`, which POSTs to `/api/calibration/submit`. The backend receives it, normalizes the scores, and stores a `CalibrationRecord` in Postgres. The current implementation does not handle HTTP errors well.

---

### Step 1: Read the existing calibration component

Open `dashboard/src/components/CalibrationFlow.tsx`. Find the `submitCalibration` function near the bottom. It looks like this:

```typescript
async function submitCalibration() {
  // ... builds payload ...
  const res = await fetch(`${BACKEND}/api/calibration/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
```

Note that there is no error handling after `await fetch(...)`.

---

### Step 2: Add error handling to the submit function

Replace the existing `submitCalibration` body with this pattern:

```typescript
async function submitCalibration() {
  setPhase({ kind: "submitting" });
  try {
    const payload = {
      userId: props.userId,
      rounds: rounds,
    };
    const res = await fetch(`${BACKEND}/api/calibration/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Server error ${res.status}: ${text}`);
    }
    const data = await res.json();
    setPhase({ kind: "done", result: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    setPhase({ kind: "error", message: msg });
  }
}
```

Then add a new phase variant to the `Phase` union at the top of the file:

```typescript
type Phase =
  | { kind: "nback"; round: number }
  | { kind: "tlx"; round: number; nbackResult: NBackResult }
  | { kind: "submitting" }
  | { kind: "done"; result: unknown }
  | { kind: "error"; message: string };
```

---

### Step 3: Add a submitting state UI and error state UI

Inside the JSX render block at the bottom of `CalibrationFlow.tsx`, add two new branches:

```tsx
{phase.kind === "submitting" && (
  <div style={{ textAlign: "center", padding: 40 }}>
    <div style={{ fontSize: 32, marginBottom: 16, animation: "spin 1s linear infinite", display: "inline-block" }}>
      ◌
    </div>
    <div style={{ color: "#94a3b8", fontSize: 14 }}>Uploading calibration data...</div>
  </div>
)}

{phase.kind === "error" && (
  <div style={{ textAlign: "center", padding: 40 }}>
    <div style={{ fontSize: 48, marginBottom: 16 }}>⚠</div>
    <div style={{ color: "#ef4444", fontSize: 15, marginBottom: 8, fontWeight: 600 }}>
      Submission failed
    </div>
    <div style={{ color: "#475569", fontSize: 13, marginBottom: 24, fontFamily: "'JetBrains Mono', monospace" }}>
      {phase.message}
    </div>
    <button
      onClick={() => setPhase({ kind: "submitting" }).then(submitCalibration)}
      style={{ padding: "10px 24px", borderRadius: 8, background: "#6366f1", color: "#fff",
        border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600 }}
    >
      Retry
    </button>
  </div>
)}
```

Wait -- the button above has an issue. `setPhase` does not return a Promise. Fix the retry button to just call `submitCalibration()` directly:

```tsx
<button onClick={submitCalibration} ...>
  Retry
</button>
```

---

### Step 4: Verify the backend calibration endpoint

Open `backend/app/api/calibration.py`. Find the route handler for `/api/calibration/submit`. Make sure it:

1. Accepts a JSON body with `userId` and `rounds` fields.
2. Stores a record in the database.
3. Returns a JSON response (not just 200 with no body).

If the function ends with just `return {"ok": True}`, add a meaningful response:

```python
return {
    "ok": True,
    "userId": payload.user_id,
    "rounds": len(payload.rounds),
    "message": "Calibration data stored.",
}
```

---

### Step 5: Test locally

1. Start the backend: `cd backend && uvicorn app.main:app --reload`
2. Start the dashboard: `cd dashboard && npm run dev`
3. Go to http://localhost:5173
4. Click the Calibration tab.
5. Complete all three rounds (you can go fast -- 1-back with all random responses is fine for testing).
6. Verify that the done state shows and no errors appear in the browser console.
7. Test error handling: stop the backend mid-calibration. Verify the error state appears and the Retry button works.

---

### Step 6: Commit and push

```bash
git add dashboard/src/components/CalibrationFlow.tsx backend/app/api/calibration.py
git commit -m "fix: robust error handling in calibration submission"
git push origin main
```

Wait for CI to go green. Done.

---

## Sprint 4: Dashboard dark aesthetic polish

**Goal:** The dashboard has a dark sci-fi theme. This sprint improves three things: the about page research timeline (currently has minor layout issues on narrow viewports), the calibration page header (currently has no visual context), and the signal breakdown component (signals without recent activity should be visually faded, not just dimmer).

**Files you will touch:**
- `dashboard/src/App.tsx` (about section, calibration section)
- `dashboard/src/components/SignalBreakdown.tsx`

**Context:** The dashboard uses inline styles throughout (no CSS files). All colors follow the palette in `dashboard/src/utils/colors.ts`. Load colors are green (< 30%), amber (30--65%), red (> 65%). Background is `#080b12`. Card backgrounds are `rgba(10,13,20,0.85)`.

---

### Step 1: Fix the about page timeline on narrow viewports

Open `dashboard/src/App.tsx`. Find the research pipeline section (the one with `step: "01"` through `step: "06"`). The vertical connector line is positioned with `position: "absolute"` and `left: 15`. On viewports narrower than 900px this bleeds out of its container.

Add `overflow: "hidden"` to the outer pipeline card container:

Find this code:
```tsx
<GlowCard style={{ padding: "20px 24px" }}>
  <div style={{ fontSize: 10, fontWeight: 700, ...
```

Change to:
```tsx
<GlowCard style={{ padding: "20px 24px", overflow: "hidden" }}>
```

---

### Step 2: Add a header to the calibration view

Inside `dashboard/src/App.tsx`, find the calibration view section:

```tsx
{view === "calibration" && (
  <GlowCard style={{ padding: "32px 40px" }}>
    <CalibrationFlow userId={sessionId} />
  </GlowCard>
)}
```

Add a header above the card:

```tsx
{view === "calibration" && (
  <div>
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: "#6366f1",
        letterSpacing: "0.12em", textTransform: "uppercase",
        fontFamily: "'JetBrains Mono', monospace", marginBottom: 6,
      }}>
        Ground Truth Collection
      </div>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#f8fafc" }}>
        Calibration Protocol
      </h2>
      <p style={{ margin: "8px 0 0", color: "#475569", fontSize: 13, maxWidth: 480 }}>
        Three N-back blocks with NASA-TLX self-reports. Your behavioral signals during
        each block become labeled training examples for the cognitive load model.
      </p>
    </div>
    <GlowCard style={{ padding: "32px 40px" }}>
      <CalibrationFlow userId={sessionId} />
    </GlowCard>
  </div>
)}
```

---

### Step 3: Fade signals with no recent activity in SignalBreakdown

Open `dashboard/src/components/SignalBreakdown.tsx`. Find the section that renders non-dominant signals. Right now, every signal renders with reduced opacity.

Add a "stale" concept: a signal is stale if it has not been dominant in the last 20 estimates.

At the top of the `SignalBreakdown` component function, after the existing `const primary = ...` line, add:

```typescript
// Which signals appeared as dominant in the last 20 estimates
const recentDominants = new Set(
  estimates.slice(-20).map(e => e.dominant)
);
```

Then in the signal bar rendering, check `recentDominants.has(sig.key)` and apply `opacity: 0.25` with `filter: "grayscale(60%)"` for stale signals:

```tsx
<div
  key={sig.key}
  style={{
    opacity: recentDominants.has(sig.key) ? 1 : 0.25,
    filter: recentDominants.has(sig.key) ? "none" : "grayscale(60%)",
    transition: "opacity 0.5s ease, filter 0.5s ease",
    // ... existing styles ...
  }}
>
```

---

### Step 4: Test locally

1. Start the dashboard: `cd dashboard && npm run dev`
2. Open http://localhost:5173
3. Go to the About tab. Resize the window to 700px wide. Verify the timeline does not overflow.
4. Go to the Calibration tab. Verify the header appears.
5. Go to the Monitor tab. Wait for demo data to load. Verify that signals with no recent activity fade out.

---

### Step 5: Commit and push

```bash
git add dashboard/src/App.tsx dashboard/src/components/SignalBreakdown.tsx
git commit -m "feat: dashboard polish -- calibration header, timeline overflow fix, stale signal fade"
git push origin main
```

Wait for CI. Done.

---

## Sprint 5: User study recruitment page

**Goal:** Build a static recruitment page at `reference-app/public/study.html` that explains the study, shows an eligibility checklist, and has a sign-up form that submits to a Google Form. This page is linked from the about section of the dashboard.

**Files you will create:**
- `reference-app/public/study.html`

**Files you will touch:**
- `dashboard/src/App.tsx` (add a link to the study page in the About hero section)

**Context:** The reference app is deployed on Cloudflare Pages. Any file in `reference-app/public/` is served as a static asset. So `public/study.html` becomes accessible at `https://neuroflow-editor.pages.dev/study.html`. You do not need to modify Vite config for this.

---

### Step 1: Create the study page

Create the file `reference-app/public/study.html`. The page must:
- Match the NeuroFlow dark aesthetic (`#0a0d14` background, JetBrains Mono + Inter fonts from Google Fonts).
- Explain what the study involves (35 minutes, coding task, no wearables).
- Show an eligibility checklist (18+, regular computer user, no photosensitivity).
- Have a sign-up button that links to your Google Form URL.
- Be self-contained HTML -- no React, no build step.

Here is a starter template. Replace `YOUR_GOOGLE_FORM_URL` with the actual form URL when you create it:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NeuroFlow User Study -- Participate</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0a0d14;
      color: #e2e8f0;
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
      padding: 60px 24px;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 640px; margin: 0 auto; }
    .tag {
      display: inline-block;
      padding: 4px 12px;
      background: rgba(99,102,241,0.15);
      border: 1px solid rgba(99,102,241,0.3);
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      color: #a5b4fc;
      font-family: 'JetBrains Mono', monospace;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 36px;
      font-weight: 800;
      color: #f8fafc;
      line-height: 1.15;
      margin-bottom: 16px;
    }
    .lead {
      font-size: 16px;
      color: #64748b;
      line-height: 1.7;
      margin-bottom: 40px;
    }
    .card {
      background: rgba(10,13,20,0.85);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      padding: 28px;
      margin-bottom: 20px;
    }
    .card h2 {
      font-size: 13px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-family: 'JetBrains Mono', monospace;
      margin-bottom: 16px;
    }
    .fact-row {
      display: flex;
      gap: 16px;
      margin-bottom: 12px;
      align-items: flex-start;
    }
    .fact-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: rgba(99,102,241,0.12);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
    }
    .fact-text strong {
      display: block;
      font-size: 14px;
      font-weight: 600;
      color: #f1f5f9;
      margin-bottom: 2px;
    }
    .fact-text span {
      font-size: 13px;
      color: #475569;
    }
    .check-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      font-size: 14px;
      color: #94a3b8;
    }
    .check-item:last-child { border-bottom: none; }
    .check-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #34d399;
      flex-shrink: 0;
    }
    .cta {
      display: block;
      width: 100%;
      padding: 16px;
      background: #6366f1;
      color: #fff;
      text-align: center;
      text-decoration: none;
      font-size: 16px;
      font-weight: 700;
      border-radius: 10px;
      margin-top: 28px;
      transition: opacity 0.15s ease;
    }
    .cta:hover { opacity: 0.9; }
    .footer {
      margin-top: 40px;
      font-size: 12px;
      color: #334155;
      text-align: center;
      line-height: 1.7;
    }
    .footer a { color: #475569; }
  </style>
</head>
<body>
  <div class="container">
    <div class="tag">CHI 2026 Research</div>
    <h1>Participate in the<br>NeuroFlow User Study</h1>
    <p class="lead">
      We are studying whether adaptive interfaces that respond to cognitive load
      improve performance and reduce mental effort during programming tasks.
      No wearables. No EEG. One 35-minute session.
    </p>

    <!-- What to expect -->
    <div class="card">
      <h2>What to expect</h2>
      <div class="fact-row">
        <div class="fact-icon">🕐</div>
        <div class="fact-text">
          <strong>35 minutes</strong>
          <span>One session, fully remote, on your own computer</span>
        </div>
      </div>
      <div class="fact-row">
        <div class="fact-icon">💻</div>
        <div class="fact-text">
          <strong>Coding task</strong>
          <span>You will write code in our browser-based editor</span>
        </div>
      </div>
      <div class="fact-row">
        <div class="fact-icon">📊</div>
        <div class="fact-text">
          <strong>Self-report survey</strong>
          <span>Short NASA-TLX questionnaire at the end of each block</span>
        </div>
      </div>
      <div class="fact-row">
        <div class="fact-icon">🔒</div>
        <div class="fact-text">
          <strong>Anonymous data only</strong>
          <span>We collect keyboard timing and mouse movement -- no content</span>
        </div>
      </div>
    </div>

    <!-- Eligibility -->
    <div class="card">
      <h2>Eligibility</h2>
      <div class="check-item"><div class="check-dot"></div> Age 18 or older</div>
      <div class="check-item"><div class="check-dot"></div> Use a computer regularly for work or study</div>
      <div class="check-item"><div class="check-dot"></div> Comfortable reading and writing basic code</div>
      <div class="check-item"><div class="check-dot"></div> Using Chrome on a desktop or laptop</div>
      <div class="check-item"><div class="check-dot"></div> No history of photosensitive seizures</div>
    </div>

    <!-- Sign up -->
    <a class="cta" href="YOUR_GOOGLE_FORM_URL" target="_blank" rel="noreferrer">
      Sign up to participate →
    </a>

    <div class="footer">
      Questions? Contact us at aprameya.bharadwaj.05@gmail.com<br>
      <a href="https://neuroflow-dashboard.pages.dev">NeuroFlow Dashboard</a> &middot;
      <a href="https://github.com/Aprameya05/neuroflow">GitHub</a>
    </div>
  </div>
</body>
</html>
```

Save the file.

---

### Step 2: Link to the study page from the dashboard About section

Open `dashboard/src/App.tsx`. Find the hero buttons array in the About view (the one with `href: "https://neuroflow-editor.pages.dev"`). Add a new button for the study page:

```tsx
{ href: "https://neuroflow-editor.pages.dev/study.html", label: "Join study →", bg: "#34d399", color: "#0f172a" },
```

Place it after the "Try editor" button.

---

### Step 3: Create the Google Form

1. Go to forms.google.com and create a new form.
2. Add these fields:
   - Email address (required)
   - "What is your rough programming experience?" (multiple choice: Beginner / Intermediate / Advanced)
   - "Are you available for a 35-minute remote session this month?" (yes/no)
3. Copy the form's share URL.
4. Replace `YOUR_GOOGLE_FORM_URL` in `study.html` with the real URL.

---

### Step 4: Test locally

1. Run `cd reference-app && npm run dev`
2. Open http://localhost:5174/study.html
3. Verify the page renders correctly with the dark theme.
4. Click the sign-up button and verify it opens the Google Form.
5. Go to http://localhost:5173 (dashboard), open About, and verify the "Join study" button appears and opens the study page.

---

### Step 5: Commit and push

```bash
git add reference-app/public/study.html dashboard/src/App.tsx
git commit -m "feat: user study recruitment page + dashboard about link"
git push origin main
```

Check CI. Check that https://neuroflow-editor.pages.dev/study.html loads after Cloudflare deploys (takes about 60 seconds). Done.

---

## Reference: things not to touch

These files are working and must not be modified:

- `extension/src/collector.js` -- the behavioral signal collector
- `extension/src/background.js` -- the WebSocket service worker
- The `warmupStarted` logic in `reference-app/src/hooks/useNeuroFlow.ts`
- EMA alpha (0.12) and STATE_DEBOUNCE_MS (2000) in the same file
- The backend WebSocket URL in `background.js`, `useNeuroFlowSocket.ts`, and `useNeuroFlow.ts`

If you are ever unsure whether something is safe to change, ask before touching it.

---

## Quick reference: local ports

| Service | Command | URL |
|---------|---------|-----|
| Backend | `cd backend && uvicorn app.main:app --reload` | http://localhost:8000 |
| Dashboard | `cd dashboard && npm run dev` | http://localhost:5173 |
| Reference app | `cd reference-app && npm run dev` | http://localhost:5174 |
