"""Network / community structure metrics.

Builds an author interaction graph from reply edges,
then computes degree distribution, Gini coefficient, and centralization.
"""

from __future__ import annotations

import networkx as nx
import numpy as np
import pandas as pd

from pipeline.reconstruct.threads import ThreadForest


def build_interaction_graph(forest: ThreadForest) -> nx.DiGraph:
    """Build a weighted directed graph of author→author reply interactions."""
    G = nx.DiGraph()
    for _, tree in forest.trees.items():
        for parent, child in tree.edges():
            a_parent = tree.nodes[parent].get("author_id")
            a_child = tree.nodes[child].get("author_id")
            if a_parent and a_child and a_parent != a_child:
                if G.has_edge(a_child, a_parent):
                    G[a_child][a_parent]["weight"] += 1
                else:
                    G.add_edge(a_child, a_parent, weight=1)
    return G


def degree_distribution(G: nx.DiGraph) -> pd.DataFrame:
    """Return in-degree and out-degree for each node."""
    rows = []
    for node in G.nodes():
        rows.append({
            "author_id": node,
            "in_degree": G.in_degree(node),
            "out_degree": G.out_degree(node),
            "total_degree": G.in_degree(node) + G.out_degree(node),
        })
    return pd.DataFrame(rows).sort_values("total_degree", ascending=False).reset_index(drop=True)


def gini_coefficient(values: np.ndarray) -> float:
    """Compute the Gini coefficient of a distribution (0 = equal, 1 = concentrated)."""
    values = np.sort(np.asarray(values, dtype=float))
    n = len(values)
    if n == 0 or values.sum() == 0:
        return 0.0
    index = np.arange(1, n + 1)
    return float((2 * np.sum(index * values) - (n + 1) * np.sum(values)) / (n * np.sum(values)))


def freeman_centralization(G: nx.DiGraph, mode: str = "in") -> float:
    """Freeman degree centralization: how star-like the network is.

    Returns 0 (uniform) to 1 (perfect star).
    """
    if len(G) <= 2:
        return 0.0
    if mode == "in":
        degrees = [G.in_degree(n) for n in G.nodes()]
    else:
        degrees = [G.out_degree(n) for n in G.nodes()]
    max_d = max(degrees)
    n = len(G)
    numerator = sum(max_d - d for d in degrees)
    denominator = (n - 1) * (n - 2)
    if denominator == 0:
        return 0.0
    return numerator / denominator


def top_k_users(deg_df: pd.DataFrame, k: int = 20) -> pd.DataFrame:
    """Return the top-k most active users by total degree."""
    return deg_df.head(k)


def network_summary(G: nx.DiGraph, deg_df: pd.DataFrame) -> dict:
    """Compute summary network metrics."""
    degrees = deg_df["total_degree"].values
    return {
        "n_authors": len(G),
        "n_edges": G.number_of_edges(),
        "density": round(nx.density(G), 6),
        "gini_total_degree": round(gini_coefficient(degrees), 4),
        "centralization_in": round(freeman_centralization(G, "in"), 4),
        "centralization_out": round(freeman_centralization(G, "out"), 4),
        "mean_degree": round(degrees.mean(), 2),
        "max_degree": int(degrees.max()) if len(degrees) > 0 else 0,
    }
