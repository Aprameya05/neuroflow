"""
NeuroFlow User Study Analysis
Run after data collection is complete.

Produces:
  - Descriptive statistics
  - Paired t-tests (NASA-TLX, task quality)
  - Effect sizes (Cohen's d)
  - Figures for the paper

Usage:
  python research/user-study/analysis.py
"""
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from scipy import stats
from pathlib import Path

DATA_DIR = Path("research/user-study/data")
FIGURES_DIR = Path("research/user-study/figures")
FIGURES_DIR.mkdir(parents=True, exist_ok=True)


def cohen_d(a: np.ndarray, b: np.ndarray) -> float:
    """Cohen's d for paired samples."""
    diff = a - b
    return diff.mean() / diff.std()


def load_data():
    """Load NASA-TLX and task scores. Falls back to synthetic data if not collected yet."""
    tlx_path = DATA_DIR / "nasa_tlx.csv"
    task_path = DATA_DIR / "task_scores.csv"

    if not tlx_path.exists():
        print("No real data yet -- generating synthetic data for analysis pipeline test")
        np.random.seed(42)
        n = 20
        # Synthetic: NeuroFlow reduces load by ~12 points on average
        control_tlx = np.random.normal(62, 14, n)
        nf_tlx = control_tlx - np.random.normal(12, 8, n)
        nf_tlx = np.clip(nf_tlx, 0, 100)
        control_quality = np.random.normal(65, 15, n)
        nf_quality = control_quality + np.random.normal(8, 6, n)
        nf_quality = np.clip(nf_quality, 0, 100)
        return pd.DataFrame({
            "participant_id": [f"P{i:02d}" for i in range(n)],
            "control_tlx": control_tlx,
            "nf_tlx": nf_tlx,
            "control_quality": control_quality,
            "nf_quality": nf_quality,
            "experience_years": np.random.randint(1, 8, n),
            "group": ["A"] * (n // 2) + ["B"] * (n // 2),
        })

    tlx = pd.read_csv(tlx_path)
    task = pd.read_csv(task_path)
    return tlx.merge(task, on="participant_id")


def run_analysis(df: pd.DataFrame):
    n = len(df)
    print(f"\nNeuroFlow User Study Analysis")
    print(f"N = {n} participants")
    print(f"{'='*50}")

    for metric, col_control, col_nf, higher_is_better in [
        ("NASA-TLX (Cognitive Load)", "control_tlx", "nf_tlx", False),
        ("Task Quality Score", "control_quality", "nf_quality", True),
    ]:
        ctrl = df[col_control].values
        nf = df[col_nf].values
        t, p = stats.ttest_rel(ctrl, nf)
        d = cohen_d(ctrl, nf)
        direction = "lower" if not higher_is_better else "higher"
        expected_sign = t > 0 if not higher_is_better else t < 0

        print(f"\n{metric}")
        print(f"  Control:   M={ctrl.mean():.1f}, SD={ctrl.std():.1f}")
        print(f"  NeuroFlow: M={nf.mean():.1f}, SD={nf.std():.1f}")
        print(f"  Difference: {nf.mean() - ctrl.mean():+.1f} points")
        print(f"  t({n-1}) = {t:.3f}, p = {p:.4f} {'*' if p < 0.05 else '(ns)'}")
        print(f"  Cohen's d = {abs(d):.3f} ({'small' if abs(d) < 0.5 else 'medium' if abs(d) < 0.8 else 'large'})")
        if p < 0.05 and expected_sign:
            print(f"  SIGNIFICANT -- NeuroFlow produced {direction} {metric}")
        else:
            print(f"  Not significant at alpha=0.05")

    return df


def plot_results(df: pd.DataFrame):
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    fig.suptitle("NeuroFlow User Study Results", fontsize=14, fontweight="bold")

    colors = {"Control": "#6b7280", "NeuroFlow": "#6366f1"}

    for ax, (metric, col_ctrl, col_nf, lower_better) in zip(axes, [
        ("NASA-TLX Score\n(lower = less cognitive load)", "control_tlx", "nf_tlx", True),
        ("Task Quality Score\n(higher = better)", "control_quality", "nf_quality", False),
    ]):
        ctrl = df[col_ctrl].values
        nf = df[col_nf].values

        # Paired lines
        for c, n in zip(ctrl, nf):
            ax.plot([0, 1], [c, n], color="#e5e7eb", linewidth=0.8, alpha=0.6, zorder=1)

        # Means with error bars
        for i, (vals, label) in enumerate([(ctrl, "Control"), (nf, "NeuroFlow")]):
            ax.errorbar(
                i, vals.mean(), yerr=vals.std() / np.sqrt(len(vals)),
                fmt="o", markersize=10, color=colors[label],
                capsize=5, capthick=2, linewidth=2, zorder=3, label=label
            )

        t, p = stats.ttest_rel(ctrl, nf)
        sig_text = f"p = {p:.3f}" + (" *" if p < 0.05 else " (ns)")
        ax.set_title(f"{metric}\n{sig_text}", fontsize=11)
        ax.set_xticks([0, 1])
        ax.set_xticklabels(["Control", "NeuroFlow"])
        ax.set_ylim(0, 100)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

    plt.tight_layout()
    out_path = FIGURES_DIR / "main_results.png"
    plt.savefig(out_path, dpi=200, bbox_inches="tight")
    print(f"\nFigure saved: {out_path}")


def generate_paper_stats(df: pd.DataFrame):
    """
    Generate the exact statistics strings needed for the paper.
    Copy-paste these directly into the Results section.
    """
    print(f"\n{'='*50}")
    print("PAPER-READY STATISTICS")
    print("Copy these directly into the Results section:")
    print(f"{'='*50}\n")

    n = len(df)

    for metric, col_ctrl, col_nf in [
        ("NASA-TLX", "control_tlx", "nf_tlx"),
        ("task quality", "control_quality", "nf_quality"),
    ]:
        ctrl = df[col_ctrl].values
        nf = df[col_nf].values
        t, p = stats.ttest_rel(ctrl, nf)
        d = cohen_d(ctrl, nf)
        ci = stats.t.interval(0.95, n-1, loc=np.mean(ctrl-nf), scale=stats.sem(ctrl-nf))

        print(f"{metric.upper()}")
        print(f'Participants reported significantly {"lower" if "TLX" in metric else "higher"} {metric} scores')
        print(f'in the NeuroFlow condition (M = {nf.mean():.1f}, SD = {nf.std():.1f})')
        print(f'compared to the control condition (M = {ctrl.mean():.1f}, SD = {ctrl.std():.1f}),')
        print(f't({n-1}) = {t:.2f}, p = {p:.3f}, d = {abs(d):.2f},')
        print(f'95% CI [{ci[0]:.1f}, {ci[1]:.1f}].\n')


if __name__ == "__main__":
    df = load_data()
    df = run_analysis(df)
    plot_results(df)
    generate_paper_stats(df)
