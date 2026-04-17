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
