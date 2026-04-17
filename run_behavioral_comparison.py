"""Run behavioral comparison: Moltbook vs Reddit CMV.

Generates comparison charts and metrics for:
1. Circadian rhythm (hour-of-day, day-of-week)
2. Linguistic homogeneity (TTR, pairwise similarity)
3. Score/karma economy

Outputs charts to frontend/public/charts/ for the analysis page.

Usage:
    python run_behavioral_comparison.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))

from pipeline.analyze.behavioral import (
    activity_by_hour,
    activity_by_dow,
    circadian_strength,
    linguistic_summary,
    score_distribution,
    type_token_ratio,
    marker_prevalence,
    posts_with_any_marker,
    per_author_marker_density,
    classify_agent_types,
    marker_summary,
)
from pipeline.analyze.plots import (
    plot_circadian,
    plot_dow,
    plot_linguistic_comparison,
    plot_ttr_distribution,
    plot_score_distribution,
    plot_marker_prevalence,
    plot_agent_types,
    plot_marker_density_hist,
)


def load_moltbook_from_supabase() -> pd.DataFrame:
    """Pull all moltbook records from cloud Supabase."""
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL", "https://dmwmwgtuexrwkfghepwy.supabase.co")
    key = os.environ.get("SUPABASE_KEY")
    if not key:
        env_path = Path(__file__).parent / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())
            key = os.environ.get("SUPABASE_KEY")
    if not key:
        raise RuntimeError("Set SUPABASE_KEY")

    sb = create_client(url, key)

    all_rows = []
    offset = 0
    while True:
        resp = sb.table("records").select("*").range(offset, offset + 999).execute()
        if not resp.data:
            break
        all_rows.extend(resp.data)
        if len(resp.data) < 1000:
            break
        offset += 1000

    df = pd.DataFrame(all_rows)
    df = df.rename(columns={"ts": "timestamp"})
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    print(f"[moltbook] Loaded {len(df)} records, {df['author_id'].nunique()} authors")
    return df


def load_reddit_cmv() -> pd.DataFrame:
    """Load Reddit CMV from local parquet."""
    path = Path("data/reddit_changemyview.parquet")
    df = pd.read_parquet(path)
    df = df.rename(columns={"author": "author_id"})
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    print(f"[reddit] Loaded {len(df)} records, {df['author_id'].nunique()} authors")
    return df


def main():
    out_dir = "frontend/public/charts"
    Path(out_dir).mkdir(parents=True, exist_ok=True)

    print("Loading datasets...")
    molt_df = load_moltbook_from_supabase()
    reddit_df = load_reddit_cmv()

    # ── 1. Circadian Rhythm ──────────────────────────────────────────
    print("\n=== CIRCADIAN RHYTHM ===")

    molt_hourly = activity_by_hour(molt_df)
    reddit_hourly = activity_by_hour(reddit_df)
    molt_dow = activity_by_dow(molt_df)
    reddit_dow = activity_by_dow(reddit_df)

    molt_circ = circadian_strength(molt_hourly)
    reddit_circ = circadian_strength(reddit_hourly)

    print(f"  Moltbook:  CV={molt_circ['coeff_var']:.4f}  chi2={molt_circ['chi2_stat']:.1f}  "
          f"peak={molt_circ['peak_hour']:02d}h  trough={molt_circ['trough_hour']:02d}h  "
          f"peak/trough={molt_circ['peak_trough_ratio']:.2f}")
    print(f"  Reddit:    CV={reddit_circ['coeff_var']:.4f}  chi2={reddit_circ['chi2_stat']:.1f}  "
          f"peak={reddit_circ['peak_hour']:02d}h  trough={reddit_circ['trough_hour']:02d}h  "
          f"peak/trough={reddit_circ['peak_trough_ratio']:.2f}")

    plot_circadian({"moltbook": molt_hourly, "reddit": reddit_hourly}, out_dir)
    plot_dow({"moltbook": molt_dow, "reddit": reddit_dow}, out_dir)

    # ── 2. Linguistic Homogeneity ────────────────────────────────────
    print("\n=== LINGUISTIC HOMOGENEITY ===")

    molt_ling = linguistic_summary(molt_df, "content", "author_id")
    reddit_ling = linguistic_summary(reddit_df, "content", "author_id")

    print(f"  Moltbook:  TTR={molt_ling['mean_ttr']:.4f}  words={molt_ling['mean_words']:.0f}  "
          f"pairwise_sim={molt_ling.get('pairwise_mean_similarity', 0):.4f}")
    print(f"  Reddit:    TTR={reddit_ling['mean_ttr']:.4f}  words={reddit_ling['mean_words']:.0f}  "
          f"pairwise_sim={reddit_ling.get('pairwise_mean_similarity', 0):.4f}")

    plot_linguistic_comparison(molt_ling, reddit_ling, out_dir)

    # TTR distributions
    molt_ttr = type_token_ratio(molt_df["content"].dropna())
    reddit_ttr = type_token_ratio(reddit_df["content"].dropna())
    molt_ttr = molt_ttr[molt_ttr > 0]
    reddit_ttr = reddit_ttr[reddit_ttr > 0]
    plot_ttr_distribution(molt_ttr, reddit_ttr, out_dir)

    # ── 3. Score/Karma Economy ───────────────────────────────────────
    print("\n=== KARMA ECONOMY ===")

    molt_scores = pd.to_numeric(molt_df.get("score"), errors="coerce").dropna()
    molt_sd = score_distribution(molt_df) if "score" in molt_df.columns else {}

    print(f"  Moltbook:  mean={molt_sd.get('mean_score', 'N/A')}  "
          f"pct_zero={molt_sd.get('pct_zero', 'N/A')}%  "
          f"gini={molt_sd.get('gini_score', 'N/A')}")
    print(f"  Reddit:    (no score column in dataset)")

    # Reddit CMV doesn't have scores, so pass None
    plot_score_distribution(molt_scores, None, out_dir)

    # ── 4. LLM Marker Analysis ──────────────────────────────────────
    print("\n=== LLM MARKER ANALYSIS ===")

    molt_prev = marker_prevalence(molt_df["content"])
    reddit_prev = marker_prevalence(reddit_df["content"])

    molt_any = posts_with_any_marker(molt_df["content"])
    reddit_any = posts_with_any_marker(reddit_df["content"])
    print(f"  Posts with any marker:  Moltbook={molt_any*100:.1f}%  Reddit={reddit_any*100:.1f}%")

    # Top markers by ratio
    print("  Top markers by Moltbook/Reddit ratio:")
    for m in sorted(molt_prev.keys(), key=lambda m: -(molt_prev[m] / max(reddit_prev.get(m, 0.00001), 0.00001)))[:8]:
        mb_pct = molt_prev[m] * 100
        rd_pct = reddit_prev.get(m, 0) * 100
        ratio = mb_pct / rd_pct if rd_pct > 0 else float("inf")
        print(f"    {m:20s}  MB={mb_pct:.2f}%  RD={rd_pct:.2f}%  ratio={ratio:.1f}x")

    plot_marker_prevalence(molt_prev, reddit_prev, out_dir)

    # Agent type classification
    molt_types = classify_agent_types(molt_df, "content", "author_id")
    print(f"\n  Agent types (n={molt_types['n_agents']}):")
    for t, info in molt_types["types"].items():
        print(f"    {t:15s}: {info['count']:4d} ({info['pct']:.1f}%)")

    plot_agent_types(molt_types, out_dir)

    # Per-author marker density
    molt_author_density = per_author_marker_density(molt_df, "content", "author_id")
    if len(molt_author_density) > 0:
        print(f"\n  Author marker density (n={len(molt_author_density)}):")
        print(f"    Mean={molt_author_density['marker_density'].mean():.3f}  "
              f"Median={molt_author_density['marker_density'].median():.3f}")
        zero_pct = (molt_author_density["marker_density"] == 0).mean() * 100
        high_pct = (molt_author_density["marker_density"] > 0.3).mean() * 100
        print(f"    Zero markers: {zero_pct:.1f}%  High (>0.3): {high_pct:.1f}%")
        plot_marker_density_hist(molt_author_density, out_dir)

    # Marker summary for JSON
    molt_markers = marker_summary(molt_df, "content", "author_id")
    reddit_markers = {
        "pct_posts_with_marker": round(reddit_any * 100, 1),
    }

    # ── Save summary JSON ────────────────────────────────────────────
    import json
    summary = {
        "moltbook": {
            "circadian": molt_circ,
            "linguistic": molt_ling,
            "karma": molt_sd,
            "markers": molt_markers,
            "n_records": len(molt_df),
        },
        "reddit": {
            "circadian": reddit_circ,
            "linguistic": reddit_ling,
            "karma": {},
            "markers": reddit_markers,
            "n_records": len(reddit_df),
        },
    }
    with open(f"{out_dir}/behavioral_summary.json", "w") as f:
        json.dump(summary, f, indent=2, default=str)

    print(f"\nDone. Charts saved to {out_dir}/")
    print("  b1_circadian.png    — hour-of-day comparison")
    print("  b1_dow.png          — day-of-week comparison")
    print("  b2_linguistic.png   — linguistic metrics bar chart")
    print("  b2_ttr_dist.png     — TTR distribution overlay")
    print("  b3_scores.png       — score distribution")
    print("  b4_markers.png      — LLM marker prevalence comparison")
    print("  b4_agent_types.png  — agent type classification")
    print("  b4_density_hist.png — per-author marker density")


if __name__ == "__main__":
    main()
