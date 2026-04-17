"""Thread reconstruction and geometry analysis for Moltbook data."""

import pandas as pd
import networkx as nx
import numpy as np
import matplotlib.pyplot as plt
from collections import Counter
from pathlib import Path


# ---------------------------------------------------------------------------
# 1. Thread reconstruction
# ---------------------------------------------------------------------------

def build_reply_trees(df: pd.DataFrame) -> dict[str, nx.DiGraph]:
    """Build a directed reply tree for each thread_id.

    Nodes carry the row data as attributes; edges point parent -> child.
    """
    trees = {}
    for tid, group in df.groupby("thread_id"):
        G = nx.DiGraph()
        for _, row in group.iterrows():
            G.add_node(row["post_id"], **row.to_dict())
            if pd.notna(row["parent_id"]):
                G.add_edge(row["parent_id"], row["post_id"])
        trees[tid] = G
    return trees


def find_root(G: nx.DiGraph) -> str | None:
    """Return the root node (in-degree 0). If ambiguous, pick the earliest timestamp."""
    roots = [n for n in G.nodes if G.in_degree(n) == 0]
    if not roots:
        return None
    if len(roots) == 1:
        return roots[0]
    return min(roots, key=lambda n: G.nodes[n].get("timestamp", ""))


# ---------------------------------------------------------------------------
# 2. Geometry metrics
# ---------------------------------------------------------------------------

def thread_depth(G: nx.DiGraph) -> int:
    """Longest root-to-leaf path length."""
    root = find_root(G)
    if root is None or len(G) <= 1:
        return 0
    return max(nx.single_source_shortest_path_length(G, root).values())


def branching_factors(G: nx.DiGraph) -> list[int]:
    """Out-degree of every non-leaf node."""
    return [d for _, d in G.out_degree() if d > 0]


def thread_metrics(trees: dict[str, nx.DiGraph]) -> pd.DataFrame:
    """Compute per-thread geometry metrics."""
    rows = []
    for tid, G in trees.items():
        bf = branching_factors(G)
        rows.append({
            "thread_id": tid,
            "num_nodes": G.number_of_nodes(),
            "depth": thread_depth(G),
            "mean_branching": np.mean(bf) if bf else 0.0,
            "max_branching": max(bf) if bf else 0,
        })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 3. Thread archetype classification
# ---------------------------------------------------------------------------

def classify_thread(G: nx.DiGraph) -> str:
    """Classify a thread as 'chain', 'star', or 'tree'.

    - chain: every node has out-degree <= 1  (linear conversation)
    - star:  depth == 1 and root fans out     (one-to-many)
    - tree:  everything else                  (branching discussion)
    """
    if G.number_of_nodes() <= 1:
        return "chain"

    max_out = max(d for _, d in G.out_degree())
    depth = thread_depth(G)

    if max_out <= 1:
        return "chain"
    if depth <= 1:
        return "star"
    return "tree"


def archetype_distribution(trees: dict[str, nx.DiGraph]) -> dict[str, float]:
    """Return percentage of each archetype."""
    labels = [classify_thread(G) for G in trees.values()]
    counts = Counter(labels)
    total = len(labels)
    return {k: round(100 * v / total, 2) for k, v in counts.items()}


# ---------------------------------------------------------------------------
# 4. Plotting
# ---------------------------------------------------------------------------

def plot_geometry_distributions(metrics: pd.DataFrame, out_dir: str = "plots"):
    """Plot histograms for depth, branching factor, and thread size."""
    Path(out_dir).mkdir(exist_ok=True)

    fig, axes = plt.subplots(1, 3, figsize=(15, 4))

    axes[0].hist(metrics["depth"], bins=range(0, metrics["depth"].max() + 2),
                 edgecolor="black", alpha=0.7)
    axes[0].set_xlabel("Thread depth")
    axes[0].set_ylabel("Count")
    axes[0].set_title("Depth distribution")

    axes[1].hist(metrics["mean_branching"], bins=20, edgecolor="black", alpha=0.7)
    axes[1].set_xlabel("Mean branching factor")
    axes[1].set_title("Branching factor distribution")

    axes[2].hist(metrics["num_nodes"], bins=20, edgecolor="black", alpha=0.7)
    axes[2].set_xlabel("Number of posts")
    axes[2].set_title("Thread size distribution")

    fig.suptitle("Thread Geometry — Moltbook", fontsize=14)
    fig.tight_layout()
    fig.savefig(f"{out_dir}/thread_geometry.png", dpi=150)
    plt.close(fig)
    print(f"Saved {out_dir}/thread_geometry.png")


def plot_archetype_pie(trees: dict[str, nx.DiGraph], out_dir: str = "plots"):
    """Pie chart of thread archetypes."""
    Path(out_dir).mkdir(exist_ok=True)
    dist = archetype_distribution(trees)

    fig, ax = plt.subplots(figsize=(5, 5))
    ax.pie(dist.values(), labels=[f"{k} ({v}%)" for k, v in dist.items()],
           autopct="%1.1f%%", startangle=140)
    ax.set_title("Thread Archetypes")
    fig.tight_layout()
    fig.savefig(f"{out_dir}/thread_archetypes.png", dpi=150)
    plt.close(fig)
    print(f"Saved {out_dir}/thread_archetypes.png")


# ---------------------------------------------------------------------------
# 5. Main entry point
# ---------------------------------------------------------------------------

def run(df: pd.DataFrame, out_dir: str = "plots"):
    """Run the full thread geometry analysis and print summary statistics."""
    print("=" * 60)
    print("THREAD GEOMETRY ANALYSIS")
    print("=" * 60)

    trees = build_reply_trees(df)
    metrics = thread_metrics(trees)

    print(f"\nTotal threads: {len(trees)}")
    print(f"\n--- Per-thread statistics ---")
    print(metrics[["num_nodes", "depth", "mean_branching"]].describe().round(2))

    dist = archetype_distribution(trees)
    print(f"\n--- Thread archetypes ---")
    for archetype, pct in sorted(dist.items()):
        print(f"  {archetype:8s}: {pct:5.1f}%")

    plot_geometry_distributions(metrics, out_dir)
    plot_archetype_pie(trees, out_dir)

    return trees, metrics


# ---------------------------------------------------------------------------
# Demo with synthetic data
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    np.random.seed(42)

    # Generate a small synthetic dataset to verify the pipeline
    records = []
    thread_counter = 0

    # Chain thread (depth 4)
    thread_counter += 1
    tid = f"t{thread_counter}"
    prev = None
    for i in range(5):
        pid = f"{tid}_p{i}"
        records.append({
            "thread_id": tid,
            "post_id": pid,
            "parent_id": prev,
            "author": f"user_{i % 3}",
            "timestamp": pd.Timestamp("2025-01-01") + pd.Timedelta(minutes=i * 10),
            "content": f"message {i}",
            "is_agent": i % 2 == 0,
        })
        prev = pid

    # Star thread (depth 1, branching 4)
    thread_counter += 1
    tid = f"t{thread_counter}"
    root_pid = f"{tid}_p0"
    records.append({
        "thread_id": tid, "post_id": root_pid, "parent_id": None,
        "author": "user_0",
        "timestamp": pd.Timestamp("2025-01-02"),
        "content": "root post", "is_agent": False,
    })
    for i in range(1, 5):
        records.append({
            "thread_id": tid, "post_id": f"{tid}_p{i}", "parent_id": root_pid,
            "author": f"user_{i}",
            "timestamp": pd.Timestamp("2025-01-02") + pd.Timedelta(minutes=i * 5),
            "content": f"reply {i}", "is_agent": True,
        })

    # Tree thread (branching at multiple levels)
    thread_counter += 1
    tid = f"t{thread_counter}"
    records.append({"thread_id": tid, "post_id": f"{tid}_p0", "parent_id": None,
                     "author": "user_0", "timestamp": pd.Timestamp("2025-01-03"),
                     "content": "root", "is_agent": False})
    records.append({"thread_id": tid, "post_id": f"{tid}_p1", "parent_id": f"{tid}_p0",
                     "author": "user_1", "timestamp": pd.Timestamp("2025-01-03 00:05"),
                     "content": "branch A", "is_agent": True})
    records.append({"thread_id": tid, "post_id": f"{tid}_p2", "parent_id": f"{tid}_p0",
                     "author": "user_2", "timestamp": pd.Timestamp("2025-01-03 00:10"),
                     "content": "branch B", "is_agent": False})
    records.append({"thread_id": tid, "post_id": f"{tid}_p3", "parent_id": f"{tid}_p1",
                     "author": "user_3", "timestamp": pd.Timestamp("2025-01-03 00:15"),
                     "content": "sub-branch A1", "is_agent": True})
    records.append({"thread_id": tid, "post_id": f"{tid}_p4", "parent_id": f"{tid}_p1",
                     "author": "user_0", "timestamp": pd.Timestamp("2025-01-03 00:20"),
                     "content": "sub-branch A2", "is_agent": False})

    df = pd.DataFrame(records)
    print("Sample data:")
    print(df.to_string(index=False))
    print()

    trees, metrics = run(df)
