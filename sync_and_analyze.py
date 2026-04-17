"""Local script: pull data from Supabase, run heavy analysis, push metrics back.

This bridges the Supabase backend with the local Python analysis pipeline.
Run manually or via local cron after observations complete.

Usage:
    # Pull latest snapshot and run analysis
    python sync_and_analyze.py

    # Pull a specific snapshot
    python sync_and_analyze.py --snapshot-id <uuid>

Requires:
    pip install supabase pandas networkx matplotlib

    Set environment variables (or create .env):
        SUPABASE_URL=https://YOUR_PROJECT.supabase.co
        SUPABASE_KEY=YOUR_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))

from pipeline.analyze.geometry import compute_geometry, archetype_summary
from pipeline.analyze.temporal import reply_latencies, temporal_summary, thread_lifetimes
from pipeline.analyze.network import (
    build_interaction_graph,
    degree_distribution,
    network_summary,
)
from pipeline.reconstruct.threads import build_forest, validate_forest


def get_supabase():
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        # Try loading from .env file
        env_path = Path(__file__).parent / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ[k.strip()] = v.strip()
            url = os.environ.get("SUPABASE_URL")
            key = os.environ.get("SUPABASE_KEY")

    if not url or not key:
        raise RuntimeError("Set SUPABASE_URL and SUPABASE_KEY")

    return create_client(url, key)


def pull_records(snapshot_id: str | None = None) -> tuple[str, pd.DataFrame]:
    """Pull normalized records from Supabase for a given snapshot."""
    sb = get_supabase()

    if snapshot_id is None:
        resp = (
            sb.table("snapshots")
            .select("id, platform, snapshot_time, dump_date")
            .eq("status", "complete")
            .order("snapshot_time", desc=True)
            .limit(1)
            .execute()
        )
        if not resp.data:
            raise RuntimeError("No complete snapshots found")
        snapshot_id = resp.data[0]["id"]
        print(f"Using latest snapshot: {snapshot_id}")
        print(f"  Platform: {resp.data[0]['platform']}")
        print(f"  Time: {resp.data[0]['snapshot_time']}")

    # Paginate through records (Supabase caps at 1000 per request)
    all_rows = []
    offset = 0
    page_size = 1000
    while True:
        resp = (
            sb.table("records")
            .select("*")
            .eq("snapshot_id", snapshot_id)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        if not resp.data:
            break
        all_rows.extend(resp.data)
        if len(resp.data) < page_size:
            break
        offset += page_size

    df = pd.DataFrame(all_rows)
    print(f"Pulled {len(df):,} records")
    return snapshot_id, df


def push_metrics(snapshot_id: str, metrics: list[dict]):
    """Push computed metrics back to Supabase."""
    sb = get_supabase()

    for batch_start in range(0, len(metrics), 500):
        batch = metrics[batch_start : batch_start + 500]
        sb.table("metrics").upsert(batch).execute()

    print(f"Pushed {len(metrics)} metrics to Supabase")


def push_thread_geometry(snapshot_id: str, geo: pd.DataFrame):
    """Push per-thread geometry to Supabase."""
    sb = get_supabase()

    rows = []
    for _, r in geo.iterrows():
        rows.append({
            "snapshot_id": snapshot_id,
            "thread_id": r["thread_id"],
            "size": int(r["size"]),
            "depth": int(r["depth"]),
            "width": int(r["width"]),
            "mean_branching": float(r["mean_branching"]),
            "max_branching": int(r["max_branching"]),
            "root_reply_share": float(r["root_reply_share"]),
            "leaf_ratio": float(r["leaf_ratio"]),
            "archetype": r["archetype"],
        })

    for i in range(0, len(rows), 500):
        batch = rows[i : i + 500]
        sb.table("thread_geometry").upsert(
            batch, on_conflict="snapshot_id,thread_id"
        ).execute()

    print(f"Pushed {len(rows)} thread geometry records")


def run(snapshot_id: str | None = None):
    """Full sync + analyze cycle."""
    snapshot_id, df = pull_records(snapshot_id)

    if len(df) == 0:
        print("No records found. Exiting.")
        return

    # Map Supabase column names to pipeline expectations
    df = df.rename(columns={"ts": "timestamp"})

    platform = df["platform"].iloc[0]
    print(f"\nAnalyzing {platform} snapshot {snapshot_id} …")

    # -- Reconstruct threads --
    forest = build_forest(df)
    report = validate_forest(forest)
    print(f"Reconstruction: {report}")

    # -- Geometry --
    geo = compute_geometry(forest)
    push_thread_geometry(snapshot_id, geo)

    archetypes = archetype_summary(geo)
    print(f"Archetypes: {archetypes}")

    # -- Temporal --
    lat = reply_latencies(forest)
    ts = temporal_summary(lat) if len(lat) > 0 else {}

    # -- Network --
    ig = build_interaction_graph(forest)
    deg = degree_distribution(ig)
    ns = network_summary(ig, deg)

    # -- Build metrics list --
    all_metrics = []

    # Geometry summary
    for col in ["size", "depth", "width", "mean_branching", "leaf_ratio", "root_reply_share"]:
        all_metrics.append({
            "snapshot_id": snapshot_id,
            "platform": platform,
            "category": "geometry",
            "name": f"mean_{col}",
            "value": float(geo[col].mean()),
        })

    # Archetypes
    for arch, pct in archetypes.items():
        all_metrics.append({
            "snapshot_id": snapshot_id,
            "platform": platform,
            "category": "geometry",
            "name": f"archetype_pct_{arch}",
            "value": pct,
        })

    # Temporal
    for k, v in ts.items():
        all_metrics.append({
            "snapshot_id": snapshot_id,
            "platform": platform,
            "category": "temporal",
            "name": k,
            "value": float(v) if v is not None else 0,
        })

    # Network
    for k, v in ns.items():
        all_metrics.append({
            "snapshot_id": snapshot_id,
            "platform": platform,
            "category": "network",
            "name": k,
            "value": float(v),
        })

    push_metrics(snapshot_id, all_metrics)

    # -- Save locally too --
    out_dir = Path("pipeline/outputs") / snapshot_id[:8]
    out_dir.mkdir(parents=True, exist_ok=True)
    geo.to_csv(out_dir / "geometry.csv", index=False)
    if len(lat) > 0:
        lat.to_csv(out_dir / "latencies.csv", index=False)

    print(f"\nDone. {len(all_metrics)} metrics pushed. Local outputs in {out_dir}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot-id", default=None)
    args = parser.parse_args()
    run(args.snapshot_id)
