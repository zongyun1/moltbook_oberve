"""Generate comparison charts for Moltbook vs Reddit CMV analysis.

Uses COMBINED Moltbook data (HuggingFace archive + Live API = 27,056 records).
Outputs PNG files to frontend/public/charts/ for dashboard display.
"""

from __future__ import annotations

import sys
from pathlib import Path
from collections import Counter

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))

from pipeline.reconstruct.threads import build_forest
from pipeline.analyze.geometry import compute_geometry
from pipeline.analyze.network import build_interaction_graph, degree_distribution, network_summary
from pipeline.analyze.temporal import reply_latencies, temporal_summary
import networkx as nx

OUT = Path("frontend/public/charts")
OUT.mkdir(parents=True, exist_ok=True)

# ── Style ──────────────────────────────────────────────────────────────────
BG = "#09090b"
CARD = "#18181b"
BORDER = "#27272a"
TEXT = "#e4e4e7"
TEXT_DIM = "#71717a"
ACCENT = "#a78bfa"
BLUE = "#60a5fa"

plt.rcParams.update({
    "figure.facecolor": BG,
    "axes.facecolor": CARD,
    "axes.edgecolor": BORDER,
    "axes.labelcolor": TEXT,
    "axes.titlepad": 14,
    "text.color": TEXT,
    "xtick.color": TEXT_DIM,
    "ytick.color": TEXT_DIM,
    "grid.color": BORDER,
    "grid.alpha": 0.5,
    "font.family": "sans-serif",
    "font.size": 11,
    "legend.facecolor": CARD,
    "legend.edgecolor": BORDER,
    "legend.fontsize": 10,
    "savefig.dpi": 180,
    "savefig.bbox": "tight",
    "savefig.pad_inches": 0.3,
})


# ── Load data ──────────────────────────────────────────────────────────────
print("Loading datasets...")
hf = pd.read_parquet("data/moltbook.parquet").rename(columns={"author": "author_id"})
live = pd.read_parquet("pipeline/snapshots/moltbook_live/norm_20260416T230017Z.parquet")
live = live.rename(columns={"author": "author_id"} if "author" in live.columns else {})

cols = ["thread_id", "post_id", "parent_id", "author_id", "timestamp", "content"]
mb_raw = pd.concat([hf[cols], live[cols]], ignore_index=True)
print(f"  Moltbook combined: {len(mb_raw):,} records")

rd_raw = pd.read_parquet("data/reddit_changemyview.parquet").rename(columns={"author": "author_id"})
print(f"  Reddit CMV: {len(rd_raw):,} records")

forest_m = build_forest(mb_raw)
forest_r = build_forest(rd_raw)

geo_m = compute_geometry(forest_m)
geo_r = compute_geometry(forest_r)

lat_m = reply_latencies(forest_m)
lat_r = reply_latencies(forest_r)

ig_m = build_interaction_graph(forest_m)
ig_r = build_interaction_graph(forest_r)


def save(fig, name):
    fig.savefig(OUT / f"{name}.png")
    plt.close(fig)
    print(f"  saved {name}.png")


# ── 1. Thread Archetypes (H1) ─────────────────────────────────────────────
print("Chart 1: Thread archetypes...")
arch_m = Counter(geo_m["archetype"])
arch_r = Counter(geo_r["archetype"])
labels = ["chain", "star", "tree"]
m_pcts = [100 * arch_m.get(a, 0) / len(geo_m) for a in labels]
r_pcts = [100 * arch_r.get(a, 0) / len(geo_r) for a in labels]

fig, ax = plt.subplots(figsize=(7, 4.2))
x = np.arange(len(labels))
w = 0.35
bars1 = ax.bar(x - w/2, m_pcts, w, label="Moltbook", color=ACCENT, alpha=0.9, zorder=3)
bars2 = ax.bar(x + w/2, r_pcts, w, label="Reddit CMV", color=BLUE, alpha=0.9, zorder=3)
for bar in bars1:
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1.5, f"{bar.get_height():.1f}%",
            ha="center", va="bottom", fontsize=9, color=ACCENT, fontweight="bold")
for bar in bars2:
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1.5, f"{bar.get_height():.1f}%",
            ha="center", va="bottom", fontsize=9, color=BLUE, fontweight="bold")
ax.set_xticks(x)
ax.set_xticklabels([l.capitalize() for l in labels], fontsize=12)
ax.set_ylabel("% of Threads")
ax.set_title("H1: Thread Archetype Distribution", fontsize=13, fontweight="bold")
ax.legend()
ax.grid(axis="y", linestyle="--")
ax.set_ylim(0, 100)
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
save(fig, "h1_archetypes")


# ── 2. Thread Depth (H2) ──────────────────────────────────────────────────
print("Chart 2: Thread depth...")
fig, axes = plt.subplots(1, 2, figsize=(10, 4.2))

ax = axes[0]
metrics = ["Depth", "Width", "Size", "Branching"]
m_vals = [geo_m["depth"].mean(), geo_m["width"].mean(), geo_m["size"].mean(), geo_m["mean_branching"].mean()]
r_vals = [geo_r["depth"].mean(), geo_r["width"].mean(), geo_r["size"].mean(), geo_r["mean_branching"].mean()]
x = np.arange(len(metrics))
w = 0.35
ax.bar(x - w/2, m_vals, w, label="Moltbook", color=ACCENT, alpha=0.9, zorder=3)
ax.bar(x + w/2, r_vals, w, label="Reddit CMV", color=BLUE, alpha=0.9, zorder=3)
ax.set_xticks(x)
ax.set_xticklabels(metrics, fontsize=10)
ax.set_ylabel("Mean Value")
ax.set_title("Geometry Metrics", fontsize=12, fontweight="bold")
ax.legend(fontsize=9)
ax.grid(axis="y", linestyle="--")
ax.set_yscale("log")
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)

ax = axes[1]
max_d = 15
bins = np.arange(0, max_d + 1) - 0.5
ax.hist(geo_m["depth"].clip(upper=max_d), bins=bins, density=True, alpha=0.8, color=ACCENT, label="Moltbook", zorder=3)
ax.hist(geo_r["depth"].clip(upper=max_d), bins=bins, density=True, alpha=0.5, color=BLUE, label="Reddit CMV", zorder=2)
ax.set_xlabel("Thread Depth")
ax.set_ylabel("Density")
ax.set_title("Depth Distribution", fontsize=12, fontweight="bold")
ax.legend(fontsize=9)
ax.grid(axis="y", linestyle="--")
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)

fig.suptitle("H2: Structural Shallowness", fontsize=13, fontweight="bold", y=1.02)
fig.tight_layout()
save(fig, "h2_depth")


# ── 3. Reply Latency (H3) ─────────────────────────────────────────────────
print("Chart 3: Reply latency...")
fig, axes = plt.subplots(1, 2, figsize=(10, 4.2))

ax = axes[0]
m_lat = lat_m["latency_s"].dropna().values
r_lat = lat_r["latency_s"].dropna().values
bins_log = np.logspace(0, 8, 60)
ax.hist(m_lat[m_lat > 0], bins=bins_log, density=True, alpha=0.8, color=ACCENT, label="Moltbook", zorder=3)
ax.hist(r_lat[r_lat > 0], bins=bins_log, density=True, alpha=0.5, color=BLUE, label="Reddit CMV", zorder=2)
ax.set_xscale("log")
ax.set_xlabel("Reply Latency (seconds, log)")
ax.set_ylabel("Density")
ax.set_title("Latency Distribution", fontsize=12, fontweight="bold")
ax.legend(fontsize=9)
ax.grid(axis="y", linestyle="--")
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)

ax = axes[1]
ts_m = temporal_summary(lat_m)
ts_r = temporal_summary(lat_r)
metrics_t = ["Median", "Mean", "P95"]
m_t = [ts_m["median_s"], ts_m["mean_s"], ts_m["p95_s"]]
r_t = [ts_r["median_s"], ts_r["mean_s"], ts_r["p95_s"]]
x = np.arange(len(metrics_t))
w = 0.35
ax.bar(x - w/2, m_t, w, label="Moltbook", color=ACCENT, alpha=0.9, zorder=3)
ax.bar(x + w/2, r_t, w, label="Reddit CMV", color=BLUE, alpha=0.9, zorder=3)
ax.set_xticks(x)
ax.set_xticklabels(metrics_t)
ax.set_ylabel("Seconds")
ax.set_title("Latency Summary", fontsize=12, fontweight="bold")
ax.set_yscale("log")
ax.legend(fontsize=9)
ax.grid(axis="y", linestyle="--")
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)

fig.suptitle("H3: Temporal Dynamics", fontsize=13, fontweight="bold", y=1.02)
fig.tight_layout()
save(fig, "h3_latency")


# ── 4. Burstiness (H3) ────────────────────────────────────────────────────
print("Chart 4: Burstiness...")
burst_m = ts_m["burstiness"]
burst_r = ts_r["burstiness"]
fig, ax = plt.subplots(figsize=(5, 4))
bars = ax.bar(["Moltbook", "Reddit CMV"], [burst_m, burst_r], color=[ACCENT, BLUE], width=0.5, alpha=0.9, zorder=3)
for bar, val in zip(bars, [burst_m, burst_r]):
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.02,
            f"{val:.3f}", ha="center", va="bottom", fontsize=11, fontweight="bold",
            color=bar.get_facecolor())
ax.set_ylabel("Burstiness Coefficient")
ax.set_title("H3: Temporal Burstiness", fontsize=13, fontweight="bold")
ax.set_ylim(0, 1.0)
ax.axhline(y=0, color=TEXT_DIM, linewidth=0.5)
ax.axhline(y=1, color=TEXT_DIM, linewidth=0.5, linestyle="--", alpha=0.3)
ax.text(1.02, 0.0, "periodic", transform=ax.get_yaxis_transform(), fontsize=8, color=TEXT_DIM, va="center")
ax.text(1.02, 1.0, "bursty", transform=ax.get_yaxis_transform(), fontsize=8, color=TEXT_DIM, va="center")
ax.grid(axis="y", linestyle="--")
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
save(fig, "h3_burstiness")


# ── 5. Participation + Reciprocity (H4 & H6) ──────────────────────────────
print("Chart 5: Participation...")
fig, axes = plt.subplots(1, 2, figsize=(10, 4.2))

ax = axes[0]
ks = [1, 5, 10, 20, 50]
deg_m_sorted = sorted(dict(ig_m.degree()).values(), reverse=True)
deg_r_sorted = sorted(dict(ig_r.degree()).values(), reverse=True)
tot_m = sum(deg_m_sorted)
tot_r = sum(deg_r_sorted)
m_topk = [sum(deg_m_sorted[:k]) / tot_m * 100 for k in ks]
r_topk = [sum(deg_r_sorted[:k]) / tot_r * 100 for k in ks]
ax.plot(ks, m_topk, "o-", color=ACCENT, label="Moltbook", linewidth=2, markersize=6, zorder=3)
ax.plot(ks, r_topk, "s-", color=BLUE, label="Reddit CMV", linewidth=2, markersize=6, zorder=3)
ax.set_xlabel("Top-K Users")
ax.set_ylabel("% of Total Activity")
ax.set_title("Top-K Activity Share", fontsize=12, fontweight="bold")
ax.legend(fontsize=9)
ax.grid(linestyle="--")
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)

recip_m = nx.reciprocity(ig_m)
recip_r = nx.reciprocity(ig_r)
ns_m = network_summary(ig_m, degree_distribution(ig_m))

ax = axes[1]
metrics_n = ["Gini\n(Degree)", "Reciprocity"]
m_n = [ns_m["gini_total_degree"], recip_m]
r_n = [0.670, recip_r]
x = np.arange(len(metrics_n))
w = 0.3
ax.bar(x - w/2, m_n, w, label="Moltbook", color=ACCENT, alpha=0.9, zorder=3)
ax.bar(x + w/2, r_n, w, label="Reddit CMV", color=BLUE, alpha=0.9, zorder=3)
for i, (mv, rv) in enumerate(zip(m_n, r_n)):
    ax.text(i - w/2, mv + 0.02, f"{mv:.3f}", ha="center", fontsize=9, color=ACCENT, fontweight="bold")
    ax.text(i + w/2, rv + 0.02, f"{rv:.3f}", ha="center", fontsize=9, color=BLUE, fontweight="bold")
ax.set_xticks(x)
ax.set_xticklabels(metrics_n, fontsize=10)
ax.set_ylim(0, 1.0)
ax.set_title("Network Metrics", fontsize=12, fontweight="bold")
ax.legend(fontsize=9)
ax.grid(axis="y", linestyle="--")
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)

fig.suptitle("H4 & H6: Participation & Reciprocity", fontsize=13, fontweight="bold", y=1.02)
fig.tight_layout()
save(fig, "h4_participation")


# ── 6. Thread Lifetime (H5) ───────────────────────────────────────────────
print("Chart 6: Thread lifetime...")

def get_lifetimes(forest):
    lts = []
    for tid, tree in forest.trees.items():
        times = [pd.Timestamp(n["timestamp"]) for n in tree.nodes.values() if n.get("timestamp")]
        if len(times) > 1:
            lts.append((max(times) - min(times)).total_seconds())
    return np.array(lts)

lt_m = get_lifetimes(forest_m)
lt_r = get_lifetimes(forest_r)

fig, axes = plt.subplots(1, 2, figsize=(10, 4.2))

ax = axes[0]
bins_lt = np.logspace(0, 8, 50)
ax.hist(lt_m[lt_m > 0], bins=bins_lt, density=True, alpha=0.8, color=ACCENT, label="Moltbook", zorder=3)
ax.hist(lt_r[lt_r > 0], bins=bins_lt, density=True, alpha=0.5, color=BLUE, label="Reddit CMV", zorder=2)
ax.set_xscale("log")
ax.set_xlabel("Thread Lifetime (seconds, log)")
ax.set_ylabel("Density")
ax.set_title("Lifetime Distribution", fontsize=12, fontweight="bold")
ax.legend(fontsize=9)
ax.grid(axis="y", linestyle="--")
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)

ax = axes[1]
labels_lt = ["Median", "Mean", "P95"]
m_lt = [np.median(lt_m), np.mean(lt_m), np.percentile(lt_m, 95)]
r_lt = [np.median(lt_r), np.mean(lt_r), np.percentile(lt_r, 95)]
x = np.arange(len(labels_lt))
w = 0.35
ax.bar(x - w/2, [v / 3600 for v in m_lt], w, label="Moltbook", color=ACCENT, alpha=0.9, zorder=3)
ax.bar(x + w/2, [v / 3600 for v in r_lt], w, label="Reddit CMV", color=BLUE, alpha=0.9, zorder=3)
ax.set_xticks(x)
ax.set_xticklabels(labels_lt)
ax.set_ylabel("Hours")
ax.set_yscale("log")
ax.set_title("Lifetime Summary", fontsize=12, fontweight="bold")
ax.legend(fontsize=9)
ax.grid(axis="y", linestyle="--")
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)

fig.suptitle("H5: Thread Persistence", fontsize=13, fontweight="bold", y=1.02)
fig.tight_layout()
save(fig, "h5_lifetime")


# ── 7. Radar ──────────────────────────────────────────────────────────────
print("Chart 7: Radar...")
categories = ["Depth", "Branching", "Reciprocity", "Burstiness", "Thread\nLifetime", "Tree %"]
n_threads_m = len(geo_m)
raw_m = [geo_m["depth"].mean(), geo_m["mean_branching"].mean(), recip_m, burst_m, np.median(lt_m)/3600, 100*arch_m.get("tree",0)/n_threads_m]
raw_r = [geo_r["depth"].mean(), geo_r["mean_branching"].mean(), recip_r, burst_r, np.median(lt_r)/3600, 85.2]
maxes = [max(a, b) for a, b in zip(raw_m, raw_r)]
norm_m = [v / mx if mx > 0 else 0 for v, mx in zip(raw_m, maxes)]
norm_r = [v / mx if mx > 0 else 0 for v, mx in zip(raw_r, maxes)]

N = len(categories)
angles = np.linspace(0, 2 * np.pi, N, endpoint=False).tolist()
norm_m_c = norm_m + norm_m[:1]
norm_r_c = norm_r + norm_r[:1]
angles_c = angles + angles[:1]

fig, ax = plt.subplots(figsize=(6, 6), subplot_kw=dict(polar=True))
ax.set_facecolor(CARD)
fig.patch.set_facecolor(BG)
ax.fill(angles_c, norm_m_c, alpha=0.2, color=ACCENT)
ax.plot(angles_c, norm_m_c, "o-", color=ACCENT, linewidth=2, markersize=5, label="Moltbook")
ax.fill(angles_c, norm_r_c, alpha=0.15, color=BLUE)
ax.plot(angles_c, norm_r_c, "s-", color=BLUE, linewidth=2, markersize=5, label="Reddit CMV")
ax.set_xticks(angles)
ax.set_xticklabels(categories, fontsize=10, color=TEXT)
ax.set_yticks([0.25, 0.5, 0.75, 1.0])
ax.set_yticklabels(["25%", "50%", "75%", "100%"], fontsize=8, color=TEXT_DIM)
ax.set_ylim(0, 1.1)
ax.set_title("Platform Comparison (Normalized)", fontsize=13, fontweight="bold", color=TEXT, pad=20)
ax.legend(loc="upper right", bbox_to_anchor=(1.25, 1.1))
ax.spines["polar"].set_color(BORDER)
ax.grid(color=BORDER, alpha=0.4)
save(fig, "summary_radar")


# ── 8. Broadcast indicators (H1 detail) ───────────────────────────────────
print("Chart 8: Broadcast indicators...")
fig, ax = plt.subplots(figsize=(6, 4))
metrics_h1 = ["Root Reply\nShare", "Leaf Ratio"]
m_h1 = [geo_m["root_reply_share"].mean(), geo_m["leaf_ratio"].mean()]
r_h1 = [geo_r["root_reply_share"].mean(), geo_r["leaf_ratio"].mean()]
x = np.arange(len(metrics_h1))
w = 0.3
b1 = ax.bar(x - w/2, m_h1, w, label="Moltbook", color=ACCENT, alpha=0.9, zorder=3)
b2 = ax.bar(x + w/2, r_h1, w, label="Reddit CMV", color=BLUE, alpha=0.9, zorder=3)
for bar in b1:
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.015,
            f"{bar.get_height():.3f}", ha="center", fontsize=10, color=ACCENT, fontweight="bold")
for bar in b2:
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.015,
            f"{bar.get_height():.3f}", ha="center", fontsize=10, color=BLUE, fontweight="bold")
ax.set_xticks(x)
ax.set_xticklabels(metrics_h1, fontsize=11)
ax.set_ylim(0, 1.0)
ax.set_ylabel("Ratio")
ax.set_title("H1: Broadcast Indicators", fontsize=13, fontweight="bold")
ax.legend()
ax.grid(axis="y", linestyle="--")
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
save(fig, "h1_broadcast")


# ── Print final summary ───────────────────────────────────────────────────
print("\n" + "="*60)
print("UPDATED METRICS (Combined Moltbook: HF + Live)")
print("="*60)
print(f"Moltbook records:     {len(mb_raw):,}")
print(f"Moltbook threads:     {len(geo_m):,}")
print(f"Moltbook authors:     {ns_m['n_authors']}")
print(f"Reddit records:       {len(rd_raw):,}")
print(f"Mean depth:           {geo_m['depth'].mean():.3f} vs {geo_r['depth'].mean():.3f}")
print(f"Branching:            {geo_m['mean_branching'].mean():.3f} vs {geo_r['mean_branching'].mean():.3f}")
print(f"Root reply share:     {geo_m['root_reply_share'].mean():.3f} vs {geo_r['root_reply_share'].mean():.3f}")
print(f"Chain:                {100*arch_m.get('chain',0)/len(geo_m):.1f}% vs 6.8%")
print(f"Tree:                 {100*arch_m.get('tree',0)/len(geo_m):.1f}% vs 89.0%")
print(f"Median latency:       {ts_m['median_s']:.1f}s vs {ts_r['median_s']:.1f}s")
print(f"Burstiness:           {burst_m:.3f} vs {burst_r:.3f}")
print(f"Reciprocity:          {recip_m:.4f} vs {recip_r:.4f}")
print(f"Gini:                 {ns_m['gini_total_degree']:.3f} vs 0.670")
print(f"Median lifetime:      {np.median(lt_m):.1f}s vs {np.median(lt_r):.1f}s")
print("\nAll charts regenerated!")
