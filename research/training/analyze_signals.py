"""
Signal Analysis -- run this BEFORE training to understand your data.
Answers key questions:
  - Which signals correlate most with NASA-TLX?
  - Are there per-user baseline differences?
  - Is there enough data to train?
  - Should we apply any feature engineering?

Run: python research/training/analyze_signals.py
"""
import json
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path
from scipy import stats

FEATURE_NAMES = [
    "keystroke_iki_ms", "mouse_velocity", "mouse_acceleration",
    "mouse_direction_changes", "scroll_velocity", "error_rate",
    "tab_switches", "pause_duration_ms", "copy_paste_count",
]

DATA_DIR = Path("calibration_data")


def load_all_sessions():
    sessions = []
    for f in DATA_DIR.glob("*.json"):
        data = json.loads(f.read_text())
        sessions.extend(data)
    return [s for s in sessions if s.get("nasa_tlx_score") is not None]


def analyze():
    sessions = load_all_sessions()

    if not sessions:
        print("No labeled calibration data found.")
        print(f"Run calibration tasks and submit to: POST /api/calibration/submit")
        print(f"Then download data from: GET /api/calibration/export-all")
        return

    print(f"\nDataset summary")
    print(f"  Total sessions: {len(sessions)}")
    users = set(s.get("user_id") for s in sessions)
    print(f"  Unique users: {len(users)}")
    print(f"  Sessions per user: {len(sessions)/len(users):.1f} avg")

    labels = np.array([s["nasa_tlx_score"] for s in sessions])
    print(f"\nNASA-TLX distribution")
    print(f"  Mean:  {labels.mean():.1f}")
    print(f"  Std:   {labels.std():.1f}")
    print(f"  Min:   {labels.min():.1f}")
    print(f"  Max:   {labels.max():.1f}")

    print(f"\nSignal correlations with NASA-TLX (Pearson r):")
    print(f"  {'Signal':<28} {'r':>6} {'p':>8} {'Significant':>12}")
    print(f"  {'-'*56}")

    correlations = []
    for feat in FEATURE_NAMES:
        vals = [s["behavioral_features"].get(feat, 0.0) for s in sessions]
        r, p = stats.pearsonr(vals, labels)
        sig = "YES ***" if p < 0.001 else "YES **" if p < 0.01 else "YES *" if p < 0.05 else "no"
        correlations.append((feat, r, p, sig))
        print(f"  {feat:<28} {r:>6.3f} {p:>8.4f} {sig:>12}")

    correlations.sort(key=lambda x: abs(x[1]), reverse=True)
    print(f"\nTop 3 most predictive signals:")
    for feat, r, p, sig in correlations[:3]:
        direction = "higher" if r > 0 else "lower"
        print(f"  {feat}: r={r:.3f} -- {direction} values = higher load")

    by_task = {}
    for s in sessions:
        t = s.get("task_type", "unknown")
        if t not in by_task:
            by_task[t] = []
        by_task[t].append(s["nasa_tlx_score"])

    print(f"\nMean NASA-TLX by task type:")
    for task, scores in sorted(by_task.items()):
        print(f"  {task:<15} mean={np.mean(scores):.1f} n={len(scores)}")

    sufficient = len(sessions) >= 50
    print(f"\nReadiness for training:")
    print(f"  Sessions: {len(sessions)} ({'enough' if sufficient else 'need more -- target 50+'})")
    print(f"  Users: {len(users)} ({'enough' if len(users) >= 5 else 'need more -- target 5+'})")
    if sufficient and len(users) >= 5:
        print(f"  READY TO TRAIN")
    else:
        print(f"  NOT YET -- collect more calibration data first")


if __name__ == "__main__":
    analyze()
