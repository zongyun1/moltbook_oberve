export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import LiveFeed from "./components/LiveFeed";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

async function getLatestSnapshot() {
  // Get all moltbook snapshots and pick the richest one
  const { data } = await getSupabase()
    .from("v_latest_snapshot")
    .select("*")
    .like("platform", "moltbook%");

  if (!data || data.length === 0) return null;

  // Merge counts across all moltbook snapshots
  const merged = { ...data[0] };
  let totalPosts = 0;
  let totalComments = 0;
  for (const s of data) {
    totalPosts += s.post_count || 0;
    totalComments += s.comment_count || 0;
  }
  merged.post_count = totalPosts;
  merged.comment_count = totalComments;
  merged.platform = "moltbook";
  merged._all_snapshot_ids = data.map((s: any) => s.id);
  return merged;
}

async function getArchetypes(snapshotIds: string[]) {
  // Fetch archetypes across all snapshots, paginating past Supabase 1000-row limit
  let allData: any[] = [];
  for (const sid of snapshotIds) {
    let offset = 0;
    while (true) {
      const { data } = await getSupabase()
        .from("thread_geometry")
        .select("archetype")
        .eq("snapshot_id", sid)
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < 1000) break;
      offset += 1000;
    }
  }

  if (allData.length === 0) return [];
  const counts: Record<string, number> = {};
  allData.forEach((r: any) => {
    counts[r.archetype] = (counts[r.archetype] || 0) + 1;
  });
  const total = allData.length;
  return Object.entries(counts)
    .map(([archetype, count]) => ({
      archetype,
      thread_count: count,
      pct: Math.round((1000 * count) / total) / 10,
    }))
    .sort((a, b) => b.thread_count - a.thread_count);
}

async function getHistory() {
  const { data } = await getSupabase()
    .from("v_snapshot_history")
    .select("*")
    .limit(14);
  return data || [];
}

async function getMetrics(snapshotIds: string[]) {
  // Try snapshots in reverse order (oldest = HF archive = richest data first)
  const reversed = [...snapshotIds].reverse();
  for (const sid of reversed) {
    const { data } = await getSupabase()
      .from("metrics")
      .select("category, name, value")
      .eq("snapshot_id", sid)
      .order("category");
    if (data && data.length > 0) return data;
  }
  return [];
}

function fmt(v: number, decimals = 2): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toFixed(decimals);
}

const METRIC_LABELS: Record<string, string> = {
  mean_size: "Avg Size",
  mean_depth: "Avg Depth",
  mean_width: "Avg Width",
  mean_mean_branching: "Avg Branching",
  mean_leaf_ratio: "Leaf Ratio",
  mean_root_reply_share: "Root Reply Share",
  mean_s: "Mean Latency",
  median_s: "Median Latency",
  std_s: "Std Dev",
  p95_s: "P95 Latency",
  burstiness: "Burstiness",
  count: "Reply Count",
  n_authors: "Authors",
  n_edges: "Edges",
  max_degree: "Max Degree",
  mean_degree: "Avg Degree",
  density: "Density",
  gini_total_degree: "Gini (Degree)",
  centralization_in: "Centralization In",
  centralization_out: "Centralization Out",
};

const TIME_METRICS = new Set(["mean_s", "median_s", "std_s", "p95_s"]);
const PCT_METRICS = new Set(["mean_leaf_ratio", "mean_root_reply_share"]);

function fmtMetricName(name: string): string {
  if (METRIC_LABELS[name]) return METRIC_LABELS[name];
  return name
    .replace(/^mean_/, "")
    .replace(/_/g, " ")
    .replace(/\bpct\b/, "%")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function fmtMetricValue(name: string, value: number): string {
  if (TIME_METRICS.has(name)) return fmtDuration(value);
  if (PCT_METRICS.has(name)) return (value * 100).toFixed(1) + "%";
  if (name.includes("archetype_pct")) return value.toFixed(1) + "%";
  if (name === "count" || name.startsWith("n_")) return fmt(value, 0);
  if (name === "burstiness" || name === "density" || name.includes("gini") || name.includes("centralization"))
    return value.toFixed(4);
  if (value >= 1) return fmt(value);
  return value.toFixed(3);
}

export default async function Dashboard() {
  const snapshot = await getLatestSnapshot();

  if (!snapshot) {
    return (
      <main className="empty-state">
        <div className="logo">M</div>
        <h1>Moltbook Observatory</h1>
        <p>No snapshots yet. Run the observer to start collecting data.</p>
        <code>curl -X POST $SUPABASE_URL/functions/v1/observe</code>
      </main>
    );
  }

  const snapshotIds: string[] = snapshot._all_snapshot_ids || [snapshot.id];
  const [archetypes, history, metrics] = await Promise.all([
    getArchetypes(snapshotIds),
    getHistory(),
    getMetrics(snapshotIds),
  ]);

  const geo = metrics.filter((m: any) => m.category === "geometry" && !m.name.includes("archetype"));
  const temporal = metrics.filter((m: any) => m.category === "temporal");
  const network = metrics.filter((m: any) => m.category === "network");

  const totalRecords = (snapshot.post_count || 0) + (snapshot.comment_count || 0);
  const snapshotDate = new Date(snapshot.snapshot_time);

  return (
    <main className="dashboard">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo">M</div>
          <h1>
            Moltbook <span>Observatory</span>
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Link href="/paper" className="records-nav-link">Paper</Link>
          <Link href="/analysis" className="records-nav-link">Analysis</Link>
          <Link href="/records" className="records-nav-link">Browse Records</Link>
          <div className="status-badge live">
            <span className="dot" />
            Observing
          </div>
        </div>
      </header>

      {/* Snapshot info bar */}
      <div className="snapshot-info">
        <div className="snapshot-info-item">
          <span className="label">Snapshot</span>
          <span className="val">{snapshotDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>
        <div className="snapshot-info-item">
          <span className="label">Dump</span>
          <span className="val">{snapshot.dump_date}</span>
        </div>
        <div className="snapshot-info-item">
          <span className="label">Platform</span>
          <span className="val">{snapshot.platform}</span>
        </div>
        <div className="snapshot-info-item">
          <span className="label">ID</span>
          <span className="val">{snapshot.id.slice(0, 8)}</span>
        </div>
      </div>

      {/* Top stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Records</div>
          <div className="stat-value">{fmt(totalRecords)}</div>
          <div className="stat-sub">{fmt(snapshot.post_count || 0)} posts + {fmt(snapshot.comment_count || 0)} comments</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Threads</div>
          <div className="stat-value">
            {fmt(archetypes.reduce((s: number, a: any) => s + a.thread_count, 0))}
          </div>
          <div className="stat-sub">{archetypes.length} archetypes detected</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Authors</div>
          <div className="stat-value">
            {fmt(network.find((m: any) => m.name === "n_authors")?.value || 0, 0)}
          </div>
          <div className="stat-sub">unique agents</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Reply Latency</div>
          <div className="stat-value">
            {fmtDuration(temporal.find((m: any) => m.name === "median_s")?.value || 0)}
          </div>
          <div className="stat-sub">median response time</div>
        </div>
      </div>

      {/* Archetypes + Geometry */}
      <div className="sections">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Thread Archetypes</div>
            <span className="card-badge">geometry</span>
          </div>
          {archetypes.map((a: any) => (
            <div key={a.archetype} className="archetype-row">
              <span className="archetype-label">{a.archetype}</span>
              <div className="archetype-bar-track">
                <div
                  className={`archetype-bar-fill ${a.archetype}`}
                  style={{ width: `${Math.max(a.pct, 3)}%` }}
                >
                  {a.pct >= 8 && <span className="archetype-pct">{a.pct}%</span>}
                </div>
                {a.pct < 8 && (
                  <span className="archetype-pct-outside">{a.pct}%</span>
                )}
              </div>
              <span className="archetype-count">{a.thread_count.toLocaleString()}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Geometry Metrics</div>
            <span className="card-badge">per-thread avg</span>
          </div>
          <div className="metric-grid">
            {geo.map((m: any) => (
              <div key={m.name} className="metric-item">
                <span className="metric-name">{fmtMetricName(m.name)}</span>
                <span className="metric-value">{fmtMetricValue(m.name, m.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Temporal + Network */}
      <div className="sections">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Temporal Dynamics</div>
            <span className="card-badge">reply timing</span>
          </div>
          <div className="metric-grid">
            {temporal.map((m: any) => (
              <div key={m.name} className="metric-item">
                <span className="metric-name">{fmtMetricName(m.name)}</span>
                <span className="metric-value">{fmtMetricValue(m.name, m.value)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Network Structure</div>
            <span className="card-badge">interaction graph</span>
          </div>
          <div className="metric-grid">
            {network.map((m: any) => (
              <div key={m.name} className="metric-item">
                <span className="metric-name">{fmtMetricName(m.name)}</span>
                <span className="metric-value">{fmtMetricValue(m.name, m.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Feed */}
      <div className="sections full">
        <LiveFeed />
      </div>

      {/* Snapshot history */}
      {history.length > 0 && (
        <div className="sections full">
          <div className="card">
            <div className="card-header">
              <div className="card-title">Snapshot History</div>
              <span className="card-badge">{history.length} snapshots</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Posts</th>
                    <th>Comments</th>
                    <th>Total</th>
                    <th>Platform</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h: any) => (
                    <tr key={h.id}>
                      <td>
                        {new Date(h.snapshot_time).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td>{(h.post_count || 0).toLocaleString()}</td>
                      <td>{(h.comment_count || 0).toLocaleString()}</td>
                      <td>{(h.total_records || 0).toLocaleString()}</td>
                      <td>{h.platform}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        <span>Moltbook Observatory</span>
        <span>
          Data from{" "}
          <a
            href="https://huggingface.co/datasets/SimulaMet/moltbook-observatory-archive"
            target="_blank"
            rel="noopener"
          >
            SimulaMet/moltbook-observatory-archive
          </a>
        </span>
      </footer>
    </main>
  );
}
