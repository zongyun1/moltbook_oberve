"""Temporal dynamics metrics.

Computes reply latency, thread lifetime, burstiness,
and activity-over-time profiles.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from pipeline.reconstruct.threads import ThreadForest


def reply_latencies(forest: ThreadForest) -> pd.DataFrame:
    """Compute reply latency (seconds) for every child→parent edge.

    Returns a DataFrame with columns: thread_id, child_id, parent_id, latency_s.
    """
    rows = []
    for tid, G in forest.trees.items():
        for parent, child in G.edges():
            pt = G.nodes[parent].get("timestamp")
            ct = G.nodes[child].get("timestamp")
            if pd.notna(pt) and pd.notna(ct):
                delta = (pd.Timestamp(ct) - pd.Timestamp(pt)).total_seconds()
                rows.append({
                    "thread_id": tid,
                    "child_id": child,
                    "parent_id": parent,
                    "latency_s": delta,
                })
    return pd.DataFrame(rows)


def thread_lifetimes(forest: ThreadForest) -> pd.DataFrame:
    """Compute thread lifetime (first post → last post, in seconds)."""
    rows = []
    for tid, G in forest.trees.items():
        timestamps = [
            pd.Timestamp(G.nodes[n]["timestamp"])
            for n in G.nodes
            if pd.notna(G.nodes[n].get("timestamp"))
        ]
        if len(timestamps) >= 2:
            lifetime = (max(timestamps) - min(timestamps)).total_seconds()
            rows.append({"thread_id": tid, "lifetime_s": lifetime, "n_posts": len(G)})
    return pd.DataFrame(rows)


def burstiness(latencies: pd.Series) -> float:
    """Compute burstiness B = (sigma - mu) / (sigma + mu).

    B ∈ [-1, 1]: B > 0 means bursty, B < 0 means periodic, B ≈ 0 means Poisson.
    """
    mu = latencies.mean()
    sigma = latencies.std()
    if mu + sigma == 0:
        return 0.0
    return (sigma - mu) / (sigma + mu)


def activity_over_time(df: pd.DataFrame, freq: str = "1h") -> pd.DataFrame:
    """Count posts per time bucket."""
    ts = pd.to_datetime(df["timestamp"], utc=True)
    counts = ts.dt.floor(freq).value_counts().sort_index()
    return counts.rename_axis("time_bucket").reset_index(name="post_count")


def temporal_summary(latencies_df: pd.DataFrame) -> dict:
    """Summary statistics for reply latencies."""
    s = latencies_df["latency_s"]
    return {
        "count": len(s),
        "mean_s": round(s.mean(), 2),
        "median_s": round(s.median(), 2),
        "std_s": round(s.std(), 2),
        "p95_s": round(s.quantile(0.95), 2),
        "burstiness": round(burstiness(s), 4),
    }
