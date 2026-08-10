# NeuroFlow — Sprint Plan
*Living document. Update after each sprint.*

---

## Sprint 1 — Pipes & Dashboard (Current)
**Goal:** Backend runs, dashboard shows live data, repo is set up.

| Task | Owner | Status |
|------|-------|--------|
| Create GitHub repo + invite collaborator | You | TODO |
| Run backend locally, health endpoint works | You | TODO |
| Test WebSocket with browser console | You | TODO |
| Run dashboard, see "Live" badge | Aashritha | TODO |
| Dashboard shows gauge + timeline + signal breakdown | Aashritha | TODO |
| Add UI State badge to dashboard | Aashritha | TODO |
| PR merged to main | Both | TODO |

---

## Sprint 2 — Persistence & Real Signal Collection
**Goal:** Real behavioral signals from the browser, stored to DB.

| Task | Owner |
|------|-------|
| Set up Alembic migrations for DB models | You |
| Wire session start/end endpoints to DB | You |
| Persist load estimates to DB | You |
| Build Chrome extension (Manifest V3) that sends real signals | You |
| Dashboard loads historical session data from API | Aashritha |
| Add session selector to dashboard (switch between sessions) | Aashritha |
| Export session data as CSV (for research analysis) | Aashritha |

---

## Sprint 3 — Calibration Protocol
**Goal:** Collect ground truth data for model training.

| Task | Owner |
|------|-------|
| Build N-back task UI (1-back, 2-back, 3-back) | Aashritha |
| Build dual-task paradigm UI | Aashritha |
| Build NASA-TLX self-report form | Aashritha |
| Wire calibration submissions to backend + DB | You |
| Per-user feature normalization (compute means/stds) | You |
| Run calibration on 10+ people, collect dataset | Both |

---

## Sprint 4 — Model Training
**Goal:** Train the LSTM, replace the heuristic stub.

| Task | Owner |
|------|-------|
| Jupyter notebook: explore calibration data | You |
| Jupyter notebook: feature engineering | You |
| PyTorch LSTM: train on calibration dataset | You |
| Export model to ONNX | You |
| Drop ONNX model into backend, verify inference works | You |
| Compare heuristic vs model estimates in dashboard | Aashritha |

---

## Sprint 5 — Adaptive Reference App
**Goal:** A real app that visibly adapts to cognitive load.

| Task | Owner |
|------|-------|
| Set up CodeMirror editor in reference-app | Aashritha |
| Integrate NeuroFlow SDK into reference-app | Aashritha |
| CSS rules for each UI state (minimal/reduced/normal/rich) | Aashritha |
| Sidebar hides at minimal, shows at rich | Aashritha |
| Autocomplete aggressiveness changes with load | Aashritha |
| Notification suppression at high load | Aashritha |
| Record demo video showing adaptation | Both |

---

## Sprint 6 — User Study
**Goal:** Evidence that the system works, paper submission.

| Task | Owner |
|------|-------|
| User study protocol design | Both |
| Recruit 20 participants | Both |
| Run study: control vs NeuroFlow condition | Both |
| Statistical analysis (task quality, self-reported stress) | You |
| Paper draft: intro, related work, system, evaluation | Both |
| Submit to CHI 2026 (deadline usually Jan) | Both |

---

## Conventions

**Branches:** `feat/your-name/description` → PR into `main`
**Commits:** `feat: ...` / `fix: ...` / `data: ...` / `research: ...`
**PRs:** Always link to which sprint task it closes
**Issues:** Use GitHub Issues for bugs, label with `sprint-N`
