"""Benchmark comparison across platforms.

Takes normalized DataFrames from multiple platforms, runs identical analyses,
and produces side-by-side metrics and comparison plots.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from pipeline.analyze.geometry import archetype_summary, compute_geometry, geometry_summary
from pipeline.analyze.network import (
    build_interaction_graph,
    degree_distribution,
    network_summary,
)
from pipeline.analyze.plots import (
    plot_archetypes,
    plot_comparison_bar,
    plot_degree_distribution,
    plot_geometry,
    plot_latency_distribution,
)
from pipeline.analyze.temporal import (
    reply_latencies,
    temporal_summary,
    thread_lifetimes,
)
from pipeline.reconstruct.threads import ThreadForest, build_forest, validate_forest


def run_full_analysis(df: pd.DataFrame, label: str, out_dir: str = "pipeline/outputs") -> dict:
    """Run geometry + temporal + network analysis on a single platform's data.

    Returns a flat metrics dict suitable for comparison.
    """
    print(f"\n{'='*60}")
    print(f"  ANALYSIS: {label.upper()}")
    print(f"{'='*60}")

    plot_dir = f"{out_dir}/plots"

    # -- Reconstruct --
    forest = build_forest(df)
    report = validate_forest(forest)
    print(f"\n[Reconstruction] {report}")

    # -- Geometry --
    geo = compute_geometry(forest)
    print(f"\n[Geometry]\n{geometry_summary(geo)}")
    print(f"\n[Archetypes] {archetype_summary(geo)}")
    plot_geometry(geo, plot_dir, label)
    plot_archetypes(geo, plot_dir, label)

    # -- Temporal --
    lat = reply_latencies(forest)
    if len(lat) > 0:
        ts = temporal_summary(lat)
        print(f"\n[Temporal] {ts}")
        plot_latency_distribution(lat, plot_dir, label)
    else:
        ts = {}
        print("\n[Temporal] No reply edges found.")

    lifetimes = thread_lifetimes(forest)

    # -- Network --
    ig = build_interaction_graph(forest)
    deg = degree_distribution(ig)
    ns = network_summary(ig, deg)
    print(f"\n[Network] {ns}")
    if len(deg) > 0:
        plot_degree_distribution(deg, plot_dir, label)

    # -- Combine metrics --
    geo_stats = geometry_summary(geo)
    metrics = {
        "platform": label,
        "n_threads": forest.n_threads,
        "n_posts": forest.n_nodes,
        "n_orphans": forest.n_orphans,
        "mean_depth": round(geo["depth"].mean(), 2),
        "mean_width": round(geo["width"].mean(), 2),
        "mean_size": round(geo["size"].mean(), 2),
        "mean_branching": round(geo["mean_branching"].mean(), 2),
        "mean_leaf_ratio": round(geo["leaf_ratio"].mean(), 3),
        "mean_root_reply_share": round(geo["root_reply_share"].mean(), 3),
    }
    metrics.update({f"temporal_{k}": v for k, v in ts.items()})
    metrics.update({f"network_{k}": v for k, v in ns.items()})
    metrics.update({f"archetype_{k}": v for k, v in archetype_summary(geo).items()})

    # -- Save --
    geo.to_csv(f"{out_dir}/{label}_geometry.csv", index=False)
    if len(lat) > 0:
        lat.to_csv(f"{out_dir}/{label}_latencies.csv", index=False)
    if len(lifetimes) > 0:
        lifetimes.to_csv(f"{out_dir}/{label}_lifetimes.csv", index=False)
    deg.to_csv(f"{out_dir}/{label}_degrees.csv", index=False)

    return metrics


def compare(datasets: dict[str, pd.DataFrame], out_dir: str = "pipeline/outputs") -> pd.DataFrame:
    """Run full analysis on each platform and produce comparison artifacts.

    Args:
        datasets: mapping of label → normalized DataFrame
        out_dir: directory for all outputs

    Returns:
        DataFrame with one row per platform, all metrics as columns.
    """
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    all_metrics = {}

    for label, df in datasets.items():
        all_metrics[label] = run_full_analysis(df, label, out_dir)

    # -- Comparison table --
    comp = pd.DataFrame(all_metrics).T
    comp.to_csv(f"{out_dir}/comparison_table.csv")
    print(f"\n{'='*60}")
    print("  COMPARISON TABLE")
    print(f"{'='*60}")
    print(comp.T.to_string())

    # -- Comparison bar charts --
    geo_keys = ["mean_depth", "mean_width", "mean_size", "mean_branching"]
    plot_comparison_bar(all_metrics, geo_keys, f"{out_dir}/plots")

    # -- Save full metrics as JSON --
    with open(f"{out_dir}/all_metrics.json", "w") as f:
        json.dump(all_metrics, f, indent=2, default=str)

    return comp
