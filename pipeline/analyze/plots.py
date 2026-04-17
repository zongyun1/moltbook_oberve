"""Plotting utilities for all analysis layers.

Every function saves to disk and returns the figure for optional display.
"""

from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


def _savefig(fig: plt.Figure, path: str | Path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  → {path}")


def plot_geometry(geo: pd.DataFrame, out_dir: str = "pipeline/outputs/plots", label: str = ""):
    """Plot geometry distributions: size, depth, width, branching."""
    prefix = f"{label}_" if label else ""
    fig, axes = plt.subplots(2, 2, figsize=(12, 9))

    axes[0, 0].hist(geo["depth"], bins=range(0, int(geo["depth"].max()) + 2),
                     edgecolor="black", alpha=0.7)
    axes[0, 0].set(xlabel="Thread depth", ylabel="Count", title="Depth")

    axes[0, 1].hist(geo["width"], bins=30, edgecolor="black", alpha=0.7)
    axes[0, 1].set(xlabel="Thread width", title="Width")

    axes[1, 0].hist(geo["mean_branching"], bins=30, edgecolor="black", alpha=0.7)
    axes[1, 0].set(xlabel="Mean branching factor", ylabel="Count", title="Branching factor")

    axes[1, 1].hist(geo["size"], bins=50, edgecolor="black", alpha=0.7)
    axes[1, 1].set(xlabel="Thread size (posts)", title="Thread size")

    fig.suptitle(f"Thread Geometry — {label or 'All'}", fontsize=14)
    fig.tight_layout()
    _savefig(fig, f"{out_dir}/{prefix}geometry.png")


def plot_archetypes(geo: pd.DataFrame, out_dir: str = "pipeline/outputs/plots", label: str = ""):
    """Pie chart of thread archetypes."""
    prefix = f"{label}_" if label else ""
    counts = geo["archetype"].value_counts()

    fig, ax = plt.subplots(figsize=(6, 6))
    ax.pie(counts.values, labels=[f"{k} ({v})" for k, v in counts.items()],
           autopct="%1.1f%%", startangle=140)
    ax.set_title(f"Thread Archetypes — {label or 'All'}")
    fig.tight_layout()
    _savefig(fig, f"{out_dir}/{prefix}archetypes.png")


def plot_latency_distribution(latencies_df: pd.DataFrame,
                               out_dir: str = "pipeline/outputs/plots", label: str = ""):
    """Histogram + log-scale of reply latencies."""
    prefix = f"{label}_" if label else ""
    s = latencies_df["latency_s"].clip(lower=0)

    fig, axes = plt.subplots(1, 2, figsize=(12, 4))

    axes[0].hist(s, bins=50, edgecolor="black", alpha=0.7)
    axes[0].set(xlabel="Reply latency (s)", ylabel="Count", title="Latency (linear)")

    axes[1].hist(s[s > 0], bins=np.logspace(np.log10(1), np.log10(s.max() + 1), 50),
                 edgecolor="black", alpha=0.7)
    axes[1].set_xscale("log")
    axes[1].set(xlabel="Reply latency (s)", title="Latency (log scale)")

    fig.suptitle(f"Reply Latency — {label or 'All'}", fontsize=14)
    fig.tight_layout()
    _savefig(fig, f"{out_dir}/{prefix}latency.png")


def plot_degree_distribution(deg_df: pd.DataFrame,
                              out_dir: str = "pipeline/outputs/plots", label: str = ""):
    """Log-log degree distribution."""
    prefix = f"{label}_" if label else ""
    fig, ax = plt.subplots(figsize=(7, 5))

    counts = deg_df["total_degree"].value_counts().sort_index()
    ax.scatter(counts.index, counts.values, s=15, alpha=0.7)
    ax.set(xscale="log", yscale="log", xlabel="Degree", ylabel="Count",
           title=f"Degree Distribution — {label or 'All'}")
    fig.tight_layout()
    _savefig(fig, f"{out_dir}/{prefix}degree_dist.png")


def plot_comparison_bar(metrics: dict[str, dict], metric_keys: list[str],
                         out_dir: str = "pipeline/outputs/plots"):
    """Side-by-side bar chart comparing platforms on selected metrics."""
    platforms = list(metrics.keys())
    x = np.arange(len(metric_keys))
    width = 0.8 / len(platforms)

    fig, ax = plt.subplots(figsize=(10, 5))
    for i, plat in enumerate(platforms):
        vals = [metrics[plat].get(k, 0) for k in metric_keys]
        ax.bar(x + i * width, vals, width, label=plat, alpha=0.8)

    ax.set_xticks(x + width * (len(platforms) - 1) / 2)
    ax.set_xticklabels(metric_keys, rotation=30, ha="right")
    ax.legend()
    ax.set_title("Platform Comparison")
    fig.tight_layout()
    _savefig(fig, f"{out_dir}/comparison.png")


# ── Behavioral analysis plots ───────��────────────────────────────────

def plot_circadian(hourly_counts: dict[str, np.ndarray],
                   out_dir: str = "pipeline/outputs/plots"):
    """Overlay hour-of-day activity for multiple platforms."""
    hours = np.arange(24)
    fig, ax = plt.subplots(figsize=(10, 5))

    colors = {"moltbook": "#f97316", "reddit": "#3b82f6"}
    for label, counts in hourly_counts.items():
        pct = counts / counts.sum() * 100 if counts.sum() > 0 else counts
        ax.plot(hours, pct, "o-", label=label, color=colors.get(label, None),
                linewidth=2, markersize=5)

    # Uniform reference
    ax.axhline(100 / 24, color="gray", linestyle="--", alpha=0.5, label="Uniform")

    ax.set_xlabel("Hour of Day (UTC)")
    ax.set_ylabel("% of Activity")
    ax.set_title("Circadian Rhythm — Activity by Hour of Day")
    ax.set_xticks(hours)
    ax.set_xticklabels([f"{h:02d}" for h in hours], fontsize=8)
    ax.legend()
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    _savefig(fig, f"{out_dir}/b1_circadian.png")


def plot_dow(dow_counts: dict[str, np.ndarray],
             out_dir: str = "pipeline/outputs/plots"):
    """Bar chart of day-of-week activity for multiple platforms."""
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    x = np.arange(7)
    width = 0.35
    fig, ax = plt.subplots(figsize=(8, 5))

    platforms = list(dow_counts.keys())
    colors = {"moltbook": "#f97316", "reddit": "#3b82f6"}
    for i, label in enumerate(platforms):
        counts = dow_counts[label]
        pct = counts / counts.sum() * 100 if counts.sum() > 0 else counts
        ax.bar(x + i * width, pct, width, label=label,
               color=colors.get(label, None), alpha=0.8)

    ax.set_xlabel("Day of Week")
    ax.set_ylabel("% of Activity")
    ax.set_title("Weekly Rhythm — Activity by Day of Week")
    ax.set_xticks(x + width * (len(platforms) - 1) / 2)
    ax.set_xticklabels(days)
    ax.legend()
    ax.grid(True, axis="y", alpha=0.3)
    fig.tight_layout()
    _savefig(fig, f"{out_dir}/b1_dow.png")


def plot_linguistic_comparison(moltbook_stats: dict, reddit_stats: dict,
                                out_dir: str = "pipeline/outputs/plots"):
    """Bar chart comparing linguistic metrics between platforms."""
    metrics = ["mean_ttr", "median_ttr", "mean_words", "pairwise_mean_similarity"]
    labels = ["Vocab Diversity\n(TTR)", "Median TTR", "Mean Words\nper Post", "Pairwise\nSimilarity"]

    molt_vals = [moltbook_stats.get(m, 0) for m in metrics]
    reddit_vals = [reddit_stats.get(m, 0) for m in metrics]

    x = np.arange(len(metrics))
    width = 0.35
    fig, ax = plt.subplots(figsize=(10, 5))

    ax.bar(x - width / 2, molt_vals, width, label="Moltbook", color="#f97316", alpha=0.8)
    ax.bar(x + width / 2, reddit_vals, width, label="Reddit CMV", color="#3b82f6", alpha=0.8)

    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_title("Linguistic Comparison — AI Agents vs Humans")
    ax.legend()
    ax.grid(True, axis="y", alpha=0.3)

    # Add value labels
    for i, (mv, rv) in enumerate(zip(molt_vals, reddit_vals)):
        ax.text(i - width / 2, mv + 0.01, f"{mv:.3f}" if mv < 10 else f"{mv:.0f}",
                ha="center", va="bottom", fontsize=8)
        ax.text(i + width / 2, rv + 0.01, f"{rv:.3f}" if rv < 10 else f"{rv:.0f}",
                ha="center", va="bottom", fontsize=8)

    fig.tight_layout()
    _savefig(fig, f"{out_dir}/b2_linguistic.png")


def plot_ttr_distribution(moltbook_ttr: pd.Series, reddit_ttr: pd.Series,
                           out_dir: str = "pipeline/outputs/plots"):
    """Overlapping histograms of type-token ratio distributions."""
    fig, ax = plt.subplots(figsize=(9, 5))

    bins = np.linspace(0, 1, 40)
    ax.hist(moltbook_ttr, bins=bins, alpha=0.6, label="Moltbook", color="#f97316", density=True)
    ax.hist(reddit_ttr, bins=bins, alpha=0.6, label="Reddit CMV", color="#3b82f6", density=True)

    ax.set_xlabel("Type-Token Ratio (vocabulary diversity)")
    ax.set_ylabel("Density")
    ax.set_title("Vocabulary Diversity Distribution")
    ax.legend()
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    _savefig(fig, f"{out_dir}/b2_ttr_dist.png")


def plot_score_distribution(moltbook_scores: pd.Series, reddit_scores: pd.Series | None,
                             out_dir: str = "pipeline/outputs/plots"):
    """Score distribution comparison. Reddit may not have scores."""
    fig, axes = plt.subplots(1, 2 if reddit_scores is not None else 1,
                             figsize=(12 if reddit_scores is not None else 7, 5))
    if reddit_scores is None:
        axes = [axes]

    # Moltbook
    ax = axes[0] if isinstance(axes, (list, np.ndarray)) else axes
    molt_s = moltbook_scores.dropna()
    if len(molt_s) > 0:
        bins = range(int(molt_s.min()), int(molt_s.max()) + 2)
        ax.hist(molt_s, bins=bins if len(list(bins)) < 50 else 50,
                color="#f97316", alpha=0.8, edgecolor="black")
    ax.set_xlabel("Score")
    ax.set_ylabel("Count")
    ax.set_title("Moltbook — Score Distribution")
    ax.grid(True, axis="y", alpha=0.3)

    # Reddit
    if reddit_scores is not None and len(axes) > 1:
        ax2 = axes[1]
        red_s = reddit_scores.dropna()
        if len(red_s) > 0:
            ax2.hist(red_s, bins=50, color="#3b82f6", alpha=0.8, edgecolor="black")
            ax2.set_yscale("log")
        ax2.set_xlabel("Score")
        ax2.set_title("Reddit CMV — Score Distribution (log scale)")
        ax2.grid(True, axis="y", alpha=0.3)

    fig.suptitle("Karma Economy — Score Distributions", fontsize=14)
    fig.tight_layout()
    _savefig(fig, f"{out_dir}/b3_scores.png")
