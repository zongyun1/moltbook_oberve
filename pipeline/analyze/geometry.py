"""Thread geometry metrics.

Computes per-thread structural statistics and classifies thread archetypes.
All functions operate on a ThreadForest produced by the reconstruction layer.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from pipeline.reconstruct.threads import (
    ThreadForest,
    branching_factors,
    leaf_ratio,
    root_reply_share,
    thread_depth,
    thread_width,
)


def compute_geometry(forest: ThreadForest) -> pd.DataFrame:
    """Compute per-thread geometry metrics."""
    rows = []
    for tid, G in forest.trees.items():
        root = forest.root_map.get(tid)
        bf = branching_factors(G)
        rows.append({
            "thread_id": tid,
            "size": G.number_of_nodes(),
            "depth": thread_depth(G, root),
            "width": thread_width(G, root),
            "mean_branching": np.mean(bf) if bf else 0.0,
            "max_branching": max(bf) if bf else 0,
            "root_reply_share": root_reply_share(G, root),
            "leaf_ratio": leaf_ratio(G),
            "archetype": classify_thread(G, root),
        })
    return pd.DataFrame(rows)


def classify_thread(G, root: str | None = None) -> str:
    """Classify thread as chain, star, or tree."""
    if G.number_of_nodes() <= 1:
        return "chain"
    max_out = max(d for _, d in G.out_degree())
    depth = thread_depth(G, root)
    if max_out <= 1:
        return "chain"
    if depth <= 1:
        return "star"
    return "tree"


def archetype_summary(geometry: pd.DataFrame) -> dict[str, float]:
    """Return percentage breakdown of thread archetypes."""
    counts = geometry["archetype"].value_counts()
    total = len(geometry)
    return {k: round(100 * v / total, 2) for k, v in counts.items()}


def geometry_summary(geometry: pd.DataFrame) -> pd.DataFrame:
    """Descriptive statistics of geometry metrics."""
    cols = ["size", "depth", "width", "mean_branching", "root_reply_share", "leaf_ratio"]
    return geometry[cols].describe().round(3)
