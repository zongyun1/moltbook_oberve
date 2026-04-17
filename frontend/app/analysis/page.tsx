export const dynamic = "force-dynamic";

import Link from "next/link";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "fs/promises";
import { join } from "path";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

async function getMoltbookMetrics() {
  const { data: snaps } = await getSupabase()
    .from("v_latest_snapshot")
    .select("*")
    .like("platform", "moltbook%");

  if (!snaps || snaps.length === 0) return { metrics: {}, totalRecords: 0, threadCount: 0 };

  const totalRecords = snaps.reduce((s: number, snap: any) => s + (snap.post_count || 0) + (snap.comment_count || 0), 0);

  const reversed = [...snaps].reverse();
  let metricsMap: Record<string, number> = {};
  for (const snap of reversed) {
    const { data } = await getSupabase()
      .from("metrics")
      .select("category, name, value")
      .eq("snapshot_id", snap.id)
      .order("category");
    if (data && data.length > 0) {
      data.forEach((m: any) => {
        metricsMap[`${m.category}/${m.name}`] = m.value;
      });
      break;
    }
  }

  let threadCount = 0;
  for (const snap of snaps) {
    const { count } = await getSupabase()
      .from("thread_geometry")
      .select("*", { count: "exact", head: true })
      .eq("snapshot_id", snap.id);
    threadCount += count || 0;
  }

  return { metrics: metricsMap, totalRecords, threadCount };
}

async function getBehavioralSummary() {
  try {
    const filePath = join(process.cwd(), "public/charts/behavioral_summary.json");
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function fmtVal(v: number, decimals = 2): string {
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toFixed(decimals);
}

export default async function AnalysisPage() {
  const { metrics: m, totalRecords, threadCount } = await getMoltbookMetrics();
  const behavioral = await getBehavioralSummary();
  const g = (key: string, fallback = 0) => m[key] ?? fallback;

  const mb = behavioral?.moltbook;
  const rb = behavioral?.reddit;

  const geometryMetrics = [
    { name: "Mean Size", value: fmtVal(g("geometry/mean_size"), 2) },
    { name: "Mean Depth", value: fmtVal(g("geometry/mean_depth"), 2) },
    { name: "Mean Width", value: fmtVal(g("geometry/mean_width"), 2) },
    { name: "Branching Factor", value: fmtVal(g("geometry/mean_mean_branching"), 2) },
    { name: "Leaf Ratio", value: (g("geometry/mean_leaf_ratio") * 100).toFixed(1) + "%" },
    { name: "Root Reply Share", value: fmtVal(g("geometry/mean_root_reply_share"), 3) },
  ];

  const archetypeMetrics = [
    { name: "Chain", value: fmtVal(g("geometry/archetype_pct_chain"), 1) + "%" },
    { name: "Star", value: fmtVal(g("geometry/archetype_pct_star"), 1) + "%" },
    { name: "Tree", value: fmtVal(g("geometry/archetype_pct_tree"), 1) + "%" },
  ];

  const temporalMetrics = [
    { name: "Mean Latency", value: fmtDuration(g("temporal/mean_s")) },
    { name: "Median Latency", value: fmtDuration(g("temporal/median_s")) },
    { name: "Std Dev", value: fmtDuration(g("temporal/std_s")) },
    { name: "P95 Latency", value: fmtDuration(g("temporal/p95_s")) },
    { name: "Burstiness", value: fmtVal(g("temporal/burstiness"), 3) },
    { name: "Reply Count", value: g("temporal/count").toLocaleString() },
  ];

  const networkMetrics = [
    { name: "Authors", value: g("network/n_authors").toLocaleString() },
    { name: "Edges", value: g("network/n_edges").toLocaleString() },
    { name: "Mean Degree", value: fmtVal(g("network/mean_degree"), 2) },
    { name: "Max Degree", value: g("network/max_degree").toLocaleString() },
    { name: "Density", value: fmtVal(g("network/density"), 4) },
    { name: "Gini (Degree)", value: fmtVal(g("network/gini_total_degree"), 3) },
    { name: "Centralization In", value: fmtVal(g("network/centralization_in"), 3) },
    { name: "Centralization Out", value: fmtVal(g("network/centralization_out"), 3) },
  ];

  const sections = [
    {
      title: "Thread Geometry",
      badge: "structural",
      metrics: geometryMetrics,
      charts: ["h2_depth"],
      description: "Per-thread structural metrics averaged across all threads. Measures how conversations branch, deepen, and terminate.",
    },
    {
      title: "Thread Archetypes",
      badge: "classification",
      metrics: archetypeMetrics,
      charts: ["h1_archetypes", "h1_broadcast"],
      description: "Classification of thread structures into canonical shapes: chains (linear), stars (hub-spoke), and trees (branching).",
    },
    {
      title: "Temporal Dynamics",
      badge: "timing",
      metrics: temporalMetrics,
      charts: ["h3_latency", "h3_burstiness"],
      description: "Reply timing distribution and temporal regularity. Burstiness coefficient B = (sigma - mu) / (sigma + mu) measures how regular or bursty the reply pattern is.",
    },
    {
      title: "Network Structure",
      badge: "graph",
      metrics: networkMetrics,
      charts: ["h4_participation"],
      description: "Interaction graph properties. Gini coefficient measures inequality of participation. Centralization measures how hub-dominated the network is.",
    },
  ];

  return (
    <main className="obs-main">
      <nav className="obs-nav">
        <div className="obs-nav-inner">
          <div className="obs-nav-left">
            <Link href="/" className="obs-nav-logo" style={{ textDecoration: "none", color: "white" }}>M</Link>
            <span className="obs-nav-title">Moltbook Analysis</span>
          </div>
          <div className="obs-nav-links">
            <Link href="/" className="obs-nav-link">Dashboard</Link>
            <Link href="/records" className="obs-nav-link">Records</Link>
            <Link href="/analysis" className="obs-nav-link active">Analysis</Link>
            <Link href="/paper" className="obs-nav-link">Paper</Link>
          </div>
          <div className="obs-live-badge">
            <span className="obs-live-dot" />
            <span>Live</span>
          </div>
        </div>
      </nav>

      <div className="obs-content">
        {/* Summary bar */}
        <div className="analysis-summary-bar">
          <div className="analysis-summary-stat">
            <span className="analysis-summary-val">{totalRecords.toLocaleString()}</span>
            <span className="analysis-summary-label">Records</span>
          </div>
          <div className="analysis-summary-stat">
            <span className="analysis-summary-val">{threadCount.toLocaleString()}</span>
            <span className="analysis-summary-label">Threads</span>
          </div>
          <div className="analysis-summary-stat">
            <span className="analysis-summary-val">{g("network/n_authors").toLocaleString()}</span>
            <span className="analysis-summary-label">Authors</span>
          </div>
          <div className="analysis-summary-stat">
            <span className="analysis-summary-val">{fmtDuration(g("temporal/median_s"))}</span>
            <span className="analysis-summary-label">Median Latency</span>
          </div>
          <div className="analysis-summary-stat">
            <span className="analysis-summary-val">{fmtVal(g("temporal/burstiness"), 3)}</span>
            <span className="analysis-summary-label">Burstiness</span>
          </div>
          <div className="analysis-summary-stat">
            <span className="analysis-summary-val">{fmtVal(g("network/gini_total_degree"), 3)}</span>
            <span className="analysis-summary-label">Gini</span>
          </div>
        </div>

        {/* Radar chart */}
        <div className="obs-card" style={{ textAlign: "center", padding: "2rem" }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "1rem" }}>
            Moltbook vs Reddit CMV — Structural Comparison
          </h2>
          <Image
            src="/charts/summary_radar.png"
            alt="Platform comparison radar"
            width={600}
            height={600}
            style={{ width: "100%", maxWidth: "500px", height: "auto", margin: "0 auto" }}
          />
        </div>

        {/* Metric sections — two column */}
        <div className="analysis-two-col">
          {sections.map((sec) => (
            <div key={sec.title} className="obs-card">
              <div className="obs-card-header">
                <h2 className="obs-card-title">{sec.title}</h2>
                <span className="obs-badge">{sec.badge}</span>
              </div>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                {sec.description}
              </p>

              {/* Metrics grid */}
              <div className="analysis-metric-grid">
                {sec.metrics.map((mt) => (
                  <div key={mt.name} className="analysis-metric-cell">
                    <span className="analysis-metric-name">{mt.name}</span>
                    <span className="analysis-metric-value">{mt.value}</span>
                  </div>
                ))}
              </div>

              {/* Charts */}
              {sec.charts.length > 0 && (
                <div className="analysis-chart-stack">
                  {sec.charts.map((c) => (
                    <div key={c} className="analysis-chart-item">
                      <Image
                        src={`/charts/${c}.png`}
                        alt={c}
                        width={800}
                        height={400}
                        style={{ width: "100%", height: "auto", borderRadius: "8px" }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Thread lifetime chart */}
        <div className="obs-card" style={{ marginTop: "1.5rem" }}>
          <div className="obs-card-header">
            <h2 className="obs-card-title">Thread Lifetime</h2>
            <span className="obs-badge">persistence</span>
          </div>
          <Image
            src="/charts/h5_lifetime.png"
            alt="Thread lifetime distribution"
            width={800}
            height={400}
            style={{ width: "100%", height: "auto", borderRadius: "8px" }}
          />
        </div>

        {/* ── Behavioral Analysis ── */}
        {behavioral && (
          <>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 700, marginTop: "2.5rem", marginBottom: "1rem", color: "var(--text-primary)" }}>
              Behavioral Analysis — AI Agents vs Humans
            </h2>

            <div className="analysis-two-col">
              {/* Circadian Rhythm */}
              <div className="obs-card">
                <div className="obs-card-header">
                  <h2 className="obs-card-title">Circadian Rhythm</h2>
                  <span className="obs-badge">temporal</span>
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                  Human activity follows strong 24-hour cycles tied to sleep and work patterns.
                  AI agents may show flatter distributions — or reveal operator timezone clustering.
                </p>
                <div className="analysis-metric-grid">
                  <div className="analysis-metric-cell">
                    <span className="analysis-metric-name">Moltbook CV</span>
                    <span className="analysis-metric-value">{mb?.circadian?.coeff_var?.toFixed(4)}</span>
                  </div>
                  <div className="analysis-metric-cell">
                    <span className="analysis-metric-name">Reddit CV</span>
                    <span className="analysis-metric-value">{rb?.circadian?.coeff_var?.toFixed(4)}</span>
                  </div>
                  <div className="analysis-metric-cell">
                    <span className="analysis-metric-name">Moltbook Peak</span>
                    <span className="analysis-metric-value">{mb?.circadian?.peak_hour}:00 UTC</span>
                  </div>
                  <div className="analysis-metric-cell">
                    <span className="analysis-metric-name">Reddit Peak</span>
                    <span className="analysis-metric-value">{rb?.circadian?.peak_hour}:00 UTC</span>
                  </div>
                  <div className="analysis-metric-cell">
                    <span className="analysis-metric-name">Moltbook Peak/Trough</span>
                    <span className="analysis-metric-value">{mb?.circadian?.peak_trough_ratio}x</span>
                  </div>
                  <div className="analysis-metric-cell">
                    <span className="analysis-metric-name">Reddit Peak/Trough</span>
                    <span className="analysis-metric-value">{rb?.circadian?.peak_trough_ratio}x</span>
                  </div>
                </div>
                <div className="analysis-chart-stack">
                  <div className="analysis-chart-item">
                    <Image src="/charts/b1_circadian.png" alt="Circadian rhythm comparison" width={800} height={400} style={{ width: "100%", height: "auto", borderRadius: "8px" }} />
                  </div>
                  <div className="analysis-chart-item">
                    <Image src="/charts/b1_dow.png" alt="Day of week comparison" width={800} height={400} style={{ width: "100%", height: "auto", borderRadius: "8px" }} />
                  </div>
                </div>
              </div>

              {/* Linguistic Homogeneity */}
              <div className="obs-card">
                <div className="obs-card-header">
                  <h2 className="obs-card-title">Linguistic Homogeneity</h2>
                  <span className="obs-badge">language</span>
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                  Type-token ratio (TTR) measures vocabulary diversity. Pairwise cosine similarity (TF-IDF) measures
                  how similarly different posts are written. Lower author TTR suggests LLM monoculture.
                </p>
                <div className="analysis-metric-grid">
                  <div className="analysis-metric-cell">
                    <span className="analysis-metric-name">Moltbook TTR</span>
                    <span className="analysis-metric-value">{mb?.linguistic?.mean_ttr?.toFixed(4)}</span>
                  </div>
                  <div className="analysis-metric-cell">
                    <span className="analysis-metric-name">Reddit TTR</span>
                    <span className="analysis-metric-value">{rb?.linguistic?.mean_ttr?.toFixed(4)}</span>
                  </div>
                  <div className="analysis-metric-cell">
                    <span className="analysis-metric-name">Moltbook Similarity</span>
                    <span className="analysis-metric-value">{mb?.linguistic?.pairwise_mean_similarity?.toFixed(4)}</span>
                  </div>
                  <div className="analysis-metric-cell">
                    <span className="analysis-metric-name">Reddit Similarity</span>
                    <span className="analysis-metric-value">{rb?.linguistic?.pairwise_mean_similarity?.toFixed(4)}</span>
                  </div>
                  <div className="analysis-metric-cell">
                    <span className="analysis-metric-name">Moltbook Words/Post</span>
                    <span className="analysis-metric-value">{mb?.linguistic?.mean_words?.toFixed(0)}</span>
                  </div>
                  <div className="analysis-metric-cell">
                    <span className="analysis-metric-name">Reddit Words/Post</span>
                    <span className="analysis-metric-value">{rb?.linguistic?.mean_words?.toFixed(0)}</span>
                  </div>
                  <div className="analysis-metric-cell">
                    <span className="analysis-metric-name">Moltbook Author TTR</span>
                    <span className="analysis-metric-value">{mb?.linguistic?.author_mean_ttr?.toFixed(4)}</span>
                  </div>
                  <div className="analysis-metric-cell">
                    <span className="analysis-metric-name">Reddit Author TTR</span>
                    <span className="analysis-metric-value">{rb?.linguistic?.author_mean_ttr?.toFixed(4)}</span>
                  </div>
                </div>
                <div className="analysis-chart-stack">
                  <div className="analysis-chart-item">
                    <Image src="/charts/b2_linguistic.png" alt="Linguistic comparison" width={800} height={400} style={{ width: "100%", height: "auto", borderRadius: "8px" }} />
                  </div>
                  <div className="analysis-chart-item">
                    <Image src="/charts/b2_ttr_dist.png" alt="TTR distribution" width={800} height={400} style={{ width: "100%", height: "auto", borderRadius: "8px" }} />
                  </div>
                </div>
              </div>
            </div>

            {/* LLM Marker Analysis — full width */}
            <div className="obs-card" style={{ marginTop: "1.5rem" }}>
              <div className="obs-card-header">
                <h2 className="obs-card-title">LLM Signature Analysis</h2>
                <span className="obs-badge">markers</span>
              </div>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                Words overrepresented in mainstream LLM output (GPT-4, Claude) serve as fingerprints.
                10.1% of Moltbook posts contain markers vs 1.5% on Reddit (6.7x), but 74% of agents
                show zero markers — the signal is driven by a vocal minority.
              </p>
              <div className="analysis-metric-grid">
                <div className="analysis-metric-cell">
                  <span className="analysis-metric-name">Posts w/ Marker (MB)</span>
                  <span className="analysis-metric-value">{mb?.markers?.pct_posts_with_marker}%</span>
                </div>
                <div className="analysis-metric-cell">
                  <span className="analysis-metric-name">Posts w/ Marker (RD)</span>
                  <span className="analysis-metric-value">{rb?.markers?.pct_posts_with_marker}%</span>
                </div>
                <div className="analysis-metric-cell">
                  <span className="analysis-metric-name">GPT-Verbose Agents</span>
                  <span className="analysis-metric-value">{mb?.markers?.pct_gpt_verbose}%</span>
                </div>
                <div className="analysis-metric-cell">
                  <span className="analysis-metric-name">Terse Bots</span>
                  <span className="analysis-metric-value">{mb?.markers?.pct_terse_bot}%</span>
                </div>
                <div className="analysis-metric-cell">
                  <span className="analysis-metric-name">Authors w/ Zero Markers</span>
                  <span className="analysis-metric-value">{mb?.markers?.pct_authors_zero_markers}%</span>
                </div>
                <div className="analysis-metric-cell">
                  <span className="analysis-metric-name">Authors High Density</span>
                  <span className="analysis-metric-value">{mb?.markers?.pct_authors_high_markers}%</span>
                </div>
              </div>
              <div className="analysis-chart-stack">
                <div className="analysis-chart-item">
                  <Image src="/charts/b4_markers.png" alt="LLM marker prevalence" width={800} height={400} style={{ width: "100%", height: "auto", borderRadius: "8px" }} />
                </div>
              </div>
              <div className="analysis-two-col" style={{ marginTop: "1rem" }}>
                <div className="analysis-chart-item">
                  <Image src="/charts/b4_agent_types.png" alt="Agent type classification" width={600} height={600} style={{ width: "100%", height: "auto", borderRadius: "8px" }} />
                </div>
                <div className="analysis-chart-item">
                  <Image src="/charts/b4_density_hist.png" alt="Marker density distribution" width={800} height={400} style={{ width: "100%", height: "auto", borderRadius: "8px" }} />
                </div>
              </div>
            </div>

            {/* Karma Economy — full width */}
            <div className="obs-card" style={{ marginTop: "1.5rem" }}>
              <div className="obs-card-header">
                <h2 className="obs-card-title">Karma Economy</h2>
                <span className="obs-badge">engagement</span>
              </div>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                Score distribution reveals engagement quality. Human communities show heavy-tailed power-law distributions.
                A flat distribution with most scores at zero suggests agents interact without meaningful evaluation —
                the voting mechanism is performative rather than functional.
              </p>
              <div className="analysis-metric-grid">
                <div className="analysis-metric-cell">
                  <span className="analysis-metric-name">Mean Score</span>
                  <span className="analysis-metric-value">{mb?.karma?.mean_score?.toFixed(2)}</span>
                </div>
                <div className="analysis-metric-cell">
                  <span className="analysis-metric-name">Median Score</span>
                  <span className="analysis-metric-value">{mb?.karma?.median_score}</span>
                </div>
                <div className="analysis-metric-cell">
                  <span className="analysis-metric-name">% Zero Score</span>
                  <span className="analysis-metric-value">{mb?.karma?.pct_zero}%</span>
                </div>
                <div className="analysis-metric-cell">
                  <span className="analysis-metric-name">% Positive</span>
                  <span className="analysis-metric-value">{mb?.karma?.pct_positive}%</span>
                </div>
                <div className="analysis-metric-cell">
                  <span className="analysis-metric-name">Gini (Score)</span>
                  <span className="analysis-metric-value">{mb?.karma?.gini_score}</span>
                </div>
                <div className="analysis-metric-cell">
                  <span className="analysis-metric-name">Max Score</span>
                  <span className="analysis-metric-value">{mb?.karma?.max_score?.toLocaleString()}</span>
                </div>
              </div>
              <div className="analysis-chart-stack">
                <div className="analysis-chart-item">
                  <Image src="/charts/b3_scores.png" alt="Score distribution" width={800} height={400} style={{ width: "100%", height: "auto", borderRadius: "8px" }} />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <footer className="obs-footer">
        <span>Moltbook Observatory — Analysis</span>
        <span>Moltbook (n={totalRecords.toLocaleString()}) vs Reddit CMV (n=21,677)</span>
      </footer>
    </main>
  );
}
