"""Thread reconstruction from normalized records.

Builds directed reply trees per thread, detects roots, validates edges,
and reports structural integrity issues.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import networkx as nx
import pandas as pd


@dataclass
class ThreadForest:
    """Collection of reconstructed thread trees with validation metadata."""

    trees: dict[str, nx.DiGraph] = field(default_factory=dict)
    orphan_edges: list[tuple[str, str, str]] = field(default_factory=list)
    root_map: dict[str, str] = field(default_factory=dict)

    @property
    def n_threads(self) -> int:
        return len(self.trees)

    @property
    def n_nodes(self) -> int:
        return sum(G.number_of_nodes() for G in self.trees.values())

    @property
    def n_orphans(self) -> int:
        return len(self.orphan_edges)


def build_forest(df: pd.DataFrame) -> ThreadForest:
    """Reconstruct all thread trees from a normalized DataFrame.

    Returns a ThreadForest with validated trees and a list of orphan edges
    (comments whose parent_id does not resolve to a known node).
    """
    forest = ThreadForest()

    for tid, group in df.groupby("thread_id"):
        G = nx.DiGraph(thread_id=tid)
        known_ids = set(group["post_id"])

        for _, row in group.iterrows():
            G.add_node(row["post_id"], **{
                "author_id": row["author_id"],
                "timestamp": row["timestamp"],
                "content": row["content"],
                "score": row.get("score"),
                "subcommunity": row.get("subcommunity"),
            })

        for _, row in group.iterrows():
            pid = row["parent_id"]
            if pd.notna(pid):
                if pid in known_ids:
                    G.add_edge(pid, row["post_id"])
                else:
                    forest.orphan_edges.append((tid, row["post_id"], pid))

        root = _find_root(G, group)
        forest.root_map[tid] = root
        forest.trees[tid] = G

    return forest


def _find_root(G: nx.DiGraph, group: pd.DataFrame) -> str | None:
    """Find the root node of a thread tree.

    Root = in-degree 0. If multiple, pick the one with the earliest timestamp.
    """
    roots = [n for n in G.nodes if G.in_degree(n) == 0]
    if not roots:
        return None
    if len(roots) == 1:
        return roots[0]
    ts_map = dict(zip(group["post_id"], group["timestamp"]))
    return min(roots, key=lambda n: ts_map.get(n, pd.Timestamp.max))


def thread_depth(G: nx.DiGraph, root: str | None = None) -> int:
    """Longest root-to-leaf path length."""
    if root is None:
        roots = [n for n in G.nodes if G.in_degree(n) == 0]
        root = roots[0] if roots else None
    if root is None or len(G) <= 1:
        return 0
    return max(nx.single_source_shortest_path_length(G, root).values())


def thread_width(G: nx.DiGraph, root: str | None = None) -> int:
    """Maximum number of nodes at any single depth level."""
    if root is None:
        roots = [n for n in G.nodes if G.in_degree(n) == 0]
        root = roots[0] if roots else None
    if root is None or len(G) <= 1:
        return 1
    depths = nx.single_source_shortest_path_length(G, root)
    from collections import Counter
    level_counts = Counter(depths.values())
    return max(level_counts.values())


def branching_factors(G: nx.DiGraph) -> list[int]:
    """Out-degree of every non-leaf node."""
    return [d for _, d in G.out_degree() if d > 0]


def leaf_ratio(G: nx.DiGraph) -> float:
    """Fraction of nodes that are leaves (out-degree 0)."""
    if len(G) == 0:
        return 0.0
    n_leaves = sum(1 for _, d in G.out_degree() if d == 0)
    return n_leaves / len(G)


def root_reply_share(G: nx.DiGraph, root: str | None = None) -> float:
    """Fraction of all replies that are direct children of the root."""
    if root is None:
        roots = [n for n in G.nodes if G.in_degree(n) == 0]
        root = roots[0] if roots else None
    if root is None or len(G) <= 1:
        return 0.0
    total_replies = len(G) - 1
    if total_replies == 0:
        return 0.0
    return G.out_degree(root) / total_replies


def validate_forest(forest: ThreadForest) -> dict:
    """Return a validation report for the forest."""
    empty_threads = [tid for tid, G in forest.trees.items() if len(G) == 0]
    no_root = [tid for tid, r in forest.root_map.items() if r is None]
    cyclic = [tid for tid, G in forest.trees.items() if not nx.is_directed_acyclic_graph(G)]

    report = {
        "total_threads": forest.n_threads,
        "total_nodes": forest.n_nodes,
        "orphan_edges": forest.n_orphans,
        "empty_threads": len(empty_threads),
        "threads_without_root": len(no_root),
        "cyclic_threads": len(cyclic),
    }
    return report
