"""Main entry point for the Moltbook observation + benchmarking pipeline.

Usage:
    # Take a LIVE Moltbook snapshot (real-time API)
    python run_pipeline.py observe --platform moltbook-live --max-posts 200

    # Take a Moltbook snapshot (from HuggingFace archive)
    python run_pipeline.py observe --platform moltbook

    # Take a Reddit snapshot
    python run_pipeline.py observe --platform reddit --subreddit changemyview --max-convos 500

    # Run comparison on cached snapshots
    python run_pipeline.py compare

    # Run with dummy data for testing
    python run_pipeline.py demo
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))


def cmd_observe(args):
    if args.platform == "moltbook-live":
        from pipeline.adapters.moltbook_live import MoltbookLiveObserver
        obs = MoltbookLiveObserver()
        obs.snapshot(max_posts=args.max_posts, sort=args.sort)

    elif args.platform == "moltbook":
        from pipeline.adapters.moltbook import MoltbookObserver
        obs = MoltbookObserver()
        obs.snapshot(dump_date=args.dump_date)

    elif args.platform == "reddit":
        from pipeline.adapters.reddit import RedditObserver
        obs = RedditObserver()
        obs.snapshot(subreddit=args.subreddit, max_convos=args.max_convos)

    else:
        print(f"Unknown platform: {args.platform}")
        sys.exit(1)


def cmd_compare(args):
    from pipeline.adapters.moltbook import MoltbookObserver
    from pipeline.adapters.reddit import RedditObserver
    from pipeline.benchmark.compare import compare

    datasets = {}

    moltbook_obs = MoltbookObserver()
    try:
        datasets["moltbook"] = moltbook_obs.load_latest()
        print(f"Loaded moltbook: {len(datasets['moltbook']):,} rows")
    except FileNotFoundError:
        print("No moltbook snapshots found. Run: python run_pipeline.py observe --platform moltbook")

    reddit_obs = RedditObserver()
    try:
        datasets["reddit"] = reddit_obs.load_latest()
        print(f"Loaded reddit: {len(datasets['reddit']):,} rows")
    except FileNotFoundError:
        print("No reddit snapshots found. Run: python run_pipeline.py observe --platform reddit")

    if len(datasets) < 1:
        print("Need at least one dataset. Exiting.")
        sys.exit(1)

    compare(datasets)
    print("\nDone. Outputs in pipeline/outputs/")


def cmd_demo(args):
    """Run the full pipeline on synthetic data to verify everything works."""
    import numpy as np
    import pandas as pd
    from pipeline.benchmark.compare import compare
    from pipeline.schema import COLUMNS

    np.random.seed(42)
    now = pd.Timestamp("2026-04-01 12:00:00", tz="UTC")

    def make_thread(platform, tid, structure, base_time):
        """Generate a synthetic thread given a structure spec."""
        records = []
        if structure == "chain":
            parent = None
            for i in range(6):
                pid = f"{tid}_p{i}"
                records.append({
                    "platform": platform,
                    "snapshot_time": now,
                    "observed_at": now,
                    "thread_id": tid,
                    "post_id": pid,
                    "parent_id": parent,
                    "author_id": f"{platform}_user_{np.random.randint(0, 10)}",
                    "timestamp": base_time + pd.Timedelta(seconds=i * np.random.randint(5, 300)),
                    "content": f"Message {i} in chain {tid}",
                    "subcommunity": "general",
                    "lang": "en",
                    "score": np.random.randint(0, 20),
                    "meta": None,
                })
                parent = pid

        elif structure == "star":
            root = f"{tid}_p0"
            records.append({
                "platform": platform, "snapshot_time": now, "observed_at": now,
                "thread_id": tid, "post_id": root, "parent_id": None,
                "author_id": f"{platform}_user_0",
                "timestamp": base_time, "content": f"Root of star {tid}",
                "subcommunity": "general", "lang": "en",
                "score": np.random.randint(5, 50), "meta": None,
            })
            for i in range(1, 8):
                records.append({
                    "platform": platform, "snapshot_time": now, "observed_at": now,
                    "thread_id": tid, "post_id": f"{tid}_p{i}", "parent_id": root,
                    "author_id": f"{platform}_user_{np.random.randint(1, 15)}",
                    "timestamp": base_time + pd.Timedelta(seconds=i * np.random.randint(10, 120)),
                    "content": f"Reply {i} to star root",
                    "subcommunity": "general", "lang": "en",
                    "score": np.random.randint(0, 10), "meta": None,
                })

        elif structure == "tree":
            root = f"{tid}_p0"
            records.append({
                "platform": platform, "snapshot_time": now, "observed_at": now,
                "thread_id": tid, "post_id": root, "parent_id": None,
                "author_id": f"{platform}_user_0",
                "timestamp": base_time, "content": f"Root of tree {tid}",
                "subcommunity": "general", "lang": "en",
                "score": np.random.randint(5, 50), "meta": None,
            })
            parents = [root]
            for i in range(1, 12):
                p = parents[np.random.randint(0, len(parents))]
                pid = f"{tid}_p{i}"
                records.append({
                    "platform": platform, "snapshot_time": now, "observed_at": now,
                    "thread_id": tid, "post_id": pid, "parent_id": p,
                    "author_id": f"{platform}_user_{np.random.randint(0, 20)}",
                    "timestamp": base_time + pd.Timedelta(seconds=i * np.random.randint(30, 600)),
                    "content": f"Node {i} in tree {tid}",
                    "subcommunity": "general", "lang": "en",
                    "score": np.random.randint(0, 15), "meta": None,
                })
                parents.append(pid)

        return records

    # Generate threads for two platforms
    all_records = {"platform_a": [], "platform_b": []}

    # Platform A: mostly chains and stars (agent-like)
    structures_a = ["chain"] * 15 + ["star"] * 8 + ["tree"] * 2
    for i, s in enumerate(structures_a):
        t = now + pd.Timedelta(hours=i)
        all_records["platform_a"].extend(make_thread("platform_a", f"a_t{i}", s, t))

    # Platform B: mostly trees (human-like)
    structures_b = ["tree"] * 18 + ["chain"] * 4 + ["star"] * 3
    for i, s in enumerate(structures_b):
        t = now + pd.Timedelta(hours=i)
        all_records["platform_b"].extend(make_thread("platform_b", f"b_t{i}", s, t))

    datasets = {
        "platform_a": pd.DataFrame(all_records["platform_a"]),
        "platform_b": pd.DataFrame(all_records["platform_b"]),
    }

    for label, df in datasets.items():
        print(f"[demo] {label}: {len(df)} records, {df['thread_id'].nunique()} threads")

    compare(datasets, out_dir="pipeline/outputs/demo")
    print("\nDemo complete. Outputs in pipeline/outputs/demo/")


def main():
    parser = argparse.ArgumentParser(description="Moltbook observation + benchmarking pipeline")
    sub = parser.add_subparsers(dest="command")

    # observe
    obs = sub.add_parser("observe", help="Take a snapshot from a platform")
    obs.add_argument("--platform", required=True, choices=["moltbook-live", "moltbook", "reddit"])
    obs.add_argument("--dump-date", default=None, help="Moltbook archive dump date")
    obs.add_argument("--subreddit", default="changemyview", help="Reddit subreddit")
    obs.add_argument("--max-convos", type=int, default=None, help="Cap Reddit conversations")
    obs.add_argument("--max-posts", type=int, default=200, help="Max posts for live API")
    obs.add_argument("--sort", default="new", help="Post sort order (new, top, hot)")

    # compare
    sub.add_parser("compare", help="Compare cached snapshots across platforms")

    # demo
    sub.add_parser("demo", help="Run on synthetic data to verify the pipeline")

    args = parser.parse_args()
    if args.command == "observe":
        cmd_observe(args)
    elif args.command == "compare":
        cmd_compare(args)
    elif args.command == "demo":
        cmd_demo(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
