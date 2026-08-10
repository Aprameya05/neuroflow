# NeuroFlow User Study Protocol
## Version 1.0

---

## Overview

**Research question:** Does real-time cognitive load adaptive interface reduce subjective cognitive load and improve task performance compared to a static interface?

**Design:** Within-subjects, counterbalanced. Each participant uses both conditions.

**Participants:** 20 (target), CS students or developers, no known cognitive disorders.

**Duration:** ~75 minutes per participant.

**Conditions:**
- **Control:** Standard code editor (NeuroFlow editor with adaptation disabled)
- **NeuroFlow:** Same editor with full cognitive load adaptation active

---

## Tasks

Both conditions use identical programming tasks. Tasks are matched for difficulty and counterbalanced across participants.

### Task Set A (used by half the participants in condition 1)
1. Implement a binary search tree with insert and search methods (25 min)
2. Debug a provided function with 3 seeded bugs (10 min)

### Task Set B (used by the other half in condition 1)
1. Implement a graph BFS traversal from scratch (25 min)
2. Debug a different provided function with 3 seeded bugs (10 min)

---

## Procedure

### Session setup (10 min)
1. Welcome participant, explain the study purpose broadly (adaptive interfaces -- do NOT mention cognitive load measurement yet to avoid demand effects)
2. Obtain informed consent
3. Demographic questionnaire (age, programming experience in years, hours/week)
4. Explain the editor interface

### Condition 1 (35 min)
1. Participant opens the editor in assigned condition
2. Researcher starts session recording (screen + think-aloud if participant consents)
3. Task begins -- researcher does NOT help
4. After task: NASA-TLX questionnaire
5. After NASA-TLX: brief open-ended debrief (3-5 min)
   - "How did you find the interface?"
   - "Was anything distracting or helpful?"
   - "Did you notice anything changing?" (probe for awareness of adaptation)

### Break (5 min)

### Condition 2 (35 min)
Same as Condition 1 with opposite condition and task set.

### Final debrief (10 min)
1. Reveal that the interface was adapting based on inferred cognitive load
2. Show the participant their own load trace from the session
3. Ask: "Looking at this, do the high-load moments match your memory of the task?"
4. Exit questionnaire

---

## Measures

### Primary
- **NASA-TLX score** (post-task, per condition)
- **Task completion quality** (rubric-scored by blind evaluator)
  - Correctness (does the code run and pass tests?)
  - Completeness (what fraction of requirements met?)
  - Code quality (naming, structure, comments)

### Secondary
- **Time on task** (time to first working solution)
- **Error rate** (from behavioral signals -- already collected automatically)
- **Self-reported awareness** (did they notice the adaptation? 1-7 Likert)

### Behavioral (collected automatically by NeuroFlow)
- Load score time series for each session
- Dominant signal per epoch
- Number of UI state transitions
- Time spent in each UI state

---

## Analysis plan

**Primary hypothesis:** NASA-TLX will be significantly lower in the NeuroFlow condition.
Test: paired t-test on NASA-TLX scores (control vs NeuroFlow), alpha = 0.05

**Secondary hypothesis:** Task quality will be higher in the NeuroFlow condition.
Test: paired t-test on rubric scores

**Exploratory:** Does the effect size vary by programming experience?
Test: moderation analysis with experience as moderator

**Effect size:** Cohen's d reported for all significant effects.

---

## Counterbalancing

| Group | Session 1 | Session 2 |
|-------|-----------|-----------|
| A (n=10) | Control + Task Set A | NeuroFlow + Task Set B |
| B (n=10) | NeuroFlow + Task Set B | Control + Task Set A |

---

## Ethical considerations

- All participants give informed consent before any data collection
- Behavioral data is anonymized (user IDs are random UUIDs, not names)
- Participants can withdraw at any time
- Screen recordings are stored encrypted and deleted after analysis
- No deception beyond withholding the adaptation mechanism (standard in HCI research)
- Full debrief at end of session

---

## Data storage

- NASA-TLX scores: `research/user-study/data/nasa_tlx.csv`
- Task scores: `research/user-study/data/task_scores.csv`
- Behavioral sessions: auto-exported from `GET /api/calibration/export-all`
- Analysis scripts: `research/user-study/analysis.py`
