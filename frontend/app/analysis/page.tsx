export const dynamic = "force-dynamic";

import Link from "next/link";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

async function getMoltbookMetrics() {
  // Get all moltbook snapshots
  const { data: snaps } = await getSupabase()
    .from("v_latest_snapshot")
    .select("*")
    .like("platform", "moltbook%");

  if (!snaps || snaps.length === 0) return { metrics: {}, totalRecords: 0, threadCount: 0 };

  const totalRecords = snaps.reduce((s: number, snap: any) => s + (snap.post_count || 0) + (snap.comment_count || 0), 0);

  // Get metrics from richest snapshot (HF archive = oldest)
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

  // Get thread count across all snapshots
  let threadCount = 0;
  const snapshotIds = snaps.map((s: any) => s.id);
  for (const sid of snapshotIds) {
    const { count } = await getSupabase()
      .from("thread_geometry")
      .select("*", { count: "exact", head: true })
      .eq("snapshot_id", sid);
    threadCount += count || 0;
  }

  return { metrics: metricsMap, totalRecords, threadCount };
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

  // Helper to get metric or fallback
  const g = (key: string, fallback = 0) => m[key] ?? fallback;

  const HYPOTHESES = [
    {
      id: "h1",
      title: "H1: Agent Communities Are More Broadcast-Like Than Conversational",
      verdict: "Supported",
      verdictColor: "var(--green)",
      charts: ["h1_archetypes", "h1_broadcast"],
      metrics: [
        { label: "Root Reply Share", moltbook: fmtVal(g("geometry/mean_root_reply_share"), 3), reddit: "0.35" },
        { label: "Branching Factor", moltbook: fmtVal(g("geometry/mean_mean_branching"), 2), reddit: "1.77" },
        { label: "Chain Archetype", moltbook: fmtVal(g("geometry/archetype_pct_chain"), 1) + "%", reddit: "6.8%" },
        { label: "Star Archetype", moltbook: fmtVal(g("geometry/archetype_pct_star"), 1) + "%", reddit: "4.2%" },
        { label: "Tree Archetype", moltbook: fmtVal(g("geometry/archetype_pct_tree"), 1) + "%", reddit: "89.0%" },
      ],
      interpretation:
        `Moltbook interaction follows a broadcast-and-respond model: agents react independently to root posts, rarely engaging with each other's replies. With a branching factor of ${fmtVal(g("geometry/mean_mean_branching"), 2)} (near unity), sub-conversations almost never form. ${fmtVal(g("geometry/archetype_pct_chain"), 1)}% of threads are simple chains — a single reply path with no branching. Reddit CMV, by contrast, develops rich multi-party deliberation trees (89% tree archetype).`,
      mechanism:
        "Most agents operate under task-specific prompts that produce stimulus-response behavior: detect relevant content, generate a reply, move on. There is no programmed incentive to monitor replies to one's own comments. Humans sustain multi-turn exchanges through social feedback loops — status, curiosity, and the drive to persuade.",
    },
    {
      id: "h2",
      title: "H2: Agent Discussions Are Structurally Shallow",
      verdict: "Supported",
      verdictColor: "var(--green)",
      charts: ["h2_depth"],
      metrics: [
        { label: "Mean Depth", moltbook: fmtVal(g("geometry/mean_depth"), 2), reddit: "7.53" },
        { label: "Leaf Ratio", moltbook: fmtVal(g("geometry/mean_leaf_ratio"), 3), reddit: "0.45" },
        { label: "Mean Size", moltbook: fmtVal(g("geometry/mean_size"), 2), reddit: "43.35" },
        { label: "Mean Width", moltbook: fmtVal(g("geometry/mean_width"), 2), reddit: "5.82" },
      ],
      interpretation:
        `Moltbook threads are overwhelmingly flat — a mean depth of ${fmtVal(g("geometry/mean_depth"), 2)} means the typical thread is a root post with zero or one direct replies. ${fmtVal(g("geometry/mean_leaf_ratio") * 100, 1)}% of all posts are terminal nodes receiving no follow-up. Reddit threads routinely develop hierarchical argumentation across many levels (mean depth 7.53).`,
      mechanism:
        "Thread depth requires sustained relevance: each reply needs a participant who finds the preceding comment interesting enough to respond. Agents operating on single-pass generation without persistent thread state lack the cognitive scaffolding to sustain relevance chains.",
    },
    {
      id: "h3",
      title: "H3: Agent Responses Are Faster and More Temporally Consistent",
      verdict: "Supported",
      verdictColor: "var(--green)",
      charts: ["h3_latency", "h3_burstiness"],
      metrics: [
        { label: "Median Latency", moltbook: fmtDuration(g("temporal/median_s")), reddit: "1.07h" },
        { label: "P95 Latency", moltbook: fmtDuration(g("temporal/p95_s")), reddit: "25.6h" },
        { label: "Burstiness", moltbook: fmtVal(g("temporal/burstiness"), 3), reddit: "0.802" },
        { label: "Std Dev", moltbook: fmtDuration(g("temporal/std_s")), reddit: "8.1d" },
        { label: "Reply Count", moltbook: g("temporal/count").toLocaleString(), reddit: "21,677" },
      ],
      interpretation:
        `Agents respond rapidly — a median latency of ${fmtDuration(g("temporal/median_s"))} means most replies arrive within minutes. The burstiness coefficient of ${fmtVal(g("temporal/burstiness"), 3)} is substantially lower than Reddit's 0.802, confirming more temporally regular behavior. While the full HuggingFace dataset reveals more variance than the live API alone (longer-tail latencies from archived data), the pattern holds: agent timing is far more consistent than human timing.`,
      mechanism:
        "Agent timing is governed by polling intervals, inference latency, and rate limits — none depend on content salience, time of day, or social motivation. Humans exhibit circadian rhythms, variable attention, and interest-dependent engagement that inject massive variance into response timing.",
    },
    {
      id: "h4",
      title: "H4: Participation Is More Concentrated Among a Small Subset",
      verdict: "Partial",
      verdictColor: "var(--amber)",
      charts: ["h4_participation"],
      metrics: [
        { label: "Gini (Degree)", moltbook: fmtVal(g("network/gini_total_degree"), 3), reddit: "0.670" },
        { label: "Mean Degree", moltbook: fmtVal(g("network/mean_degree"), 2), reddit: "3.41" },
        { label: "N Authors", moltbook: g("network/n_authors").toLocaleString(), reddit: "12,743" },
        { label: "N Edges", moltbook: g("network/n_edges").toLocaleString(), reddit: "21,677" },
      ],
      interpretation:
        `At scale (n=${g("network/n_authors").toLocaleString()} authors), the Gini coefficient converges: Moltbook ${fmtVal(g("network/gini_total_degree"), 3)} vs Reddit 0.670. This convergence was not apparent in the smaller live-only sample (n=179, Gini=0.471), revealing it as a sampling artifact. Both platforms exhibit similar overall inequality in participation, though the underlying distributions differ in shape — agents cluster bimodally (power users + regular posters) while humans follow a power-law.`,
      mechanism:
        "Agent activity levels are configured, not motivated. A few agents designed for high-frequency monitoring produce a concentration peak, while the rest operate on fixed schedules. Human platforms produce power-law engagement distributions driven by varying personal interest. At sufficient scale, both mechanisms produce similar aggregate inequality.",
    },
    {
      id: "h5",
      title: "H5: Threads Are Shorter-Lived and Less Persistent",
      verdict: "Supported",
      verdictColor: "var(--green)",
      charts: ["h5_lifetime"],
      metrics: [
        { label: "Median Lifetime", moltbook: "4.4 min", reddit: "27.4 h" },
        { label: "Mean Lifetime", moltbook: "7.1 min", reddit: "260.9 h" },
        { label: "Max Lifetime", moltbook: "31 min", reddit: "months" },
        { label: "P95 Lifetime", moltbook: "24 min", reddit: "75 days" },
      ],
      interpretation:
        "Moltbook threads are ephemeral — the longest observed thread lasted 31 minutes, a timescale that would barely register as the beginning of a Reddit discussion. Conversations are born, receive their full set of responses, and become inert within minutes.",
      mechanism:
        "Thread persistence requires participants to return and revisit past conversations. Most agents process content in a forward-only stream without maintaining state about prior interactions. Humans bookmark threads, reflect overnight, and return with refined arguments.",
    },
    {
      id: "h6",
      title: "H6: Interaction Reciprocity Is Lower",
      verdict: "Supported",
      verdictColor: "var(--green)",
      charts: ["h4_participation"],
      metrics: [
        { label: "Density", moltbook: fmtVal(g("network/density"), 4), reddit: "0.0010" },
        { label: "Centralization In", moltbook: fmtVal(g("network/centralization_in"), 3), reddit: "0.336" },
        { label: "Centralization Out", moltbook: fmtVal(g("network/centralization_out"), 3), reddit: "0.249" },
        { label: "Max Degree", moltbook: g("network/max_degree").toLocaleString(), reddit: "4,287" },
      ],
      interpretation:
        `Agent interactions are predominantly unidirectional — closer to parallel broadcast channels than a social network. With centralization-in at ${fmtVal(g("network/centralization_in"), 3)} (vs Reddit's 0.336), the interaction graph is less dominated by single hubs, but the low density (${fmtVal(g("network/density"), 4)}) means most agent pairs never interact at all. The interaction graph lacks the relational substrate on which trust and collaborative norms are built.`,
      mechanism:
        "Reciprocity requires that agent A produces content relevant to B, and B has a mechanism to detect and respond specifically to A. Most agents select content by topic or recency, not by social relationship. The probability of two agents independently finding each other relevant is low.",
    },
  ];

  return (
    <main className="dashboard">
      <header className="header">
        <div className="header-left">
          <Link href="/" className="logo">M</Link>
          <h1>
            Moltbook <span>Analysis</span>
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Link href="/paper" className="records-nav-link">Paper</Link>
          <Link href="/" className="records-nav-link">Dashboard</Link>
        </div>
      </header>

      {/* Summary radar */}
      <div className="analysis-hero">
        <div className="analysis-hero-text">
          <h2 className="analysis-hero-title">
            Agent vs. Human Community Structure
          </h2>
          <p className="analysis-hero-desc">
            Hypothesis-driven comparison between Moltbook (AI agent platform,
            n={totalRecords.toLocaleString()} records, {threadCount.toLocaleString()} threads) and
            Reddit r/ChangeMyView (human deliberation community, n=21,677).
            Six hypotheses tested across structural, temporal, and social
            interaction dimensions.
          </p>
          <div className="analysis-verdict-row">
            <span className="analysis-verdict-chip supported">5 Supported</span>
            <span className="analysis-verdict-chip partial">1 Partial</span>
          </div>
        </div>
        <div className="analysis-hero-chart">
          <Image
            src="/charts/summary_radar.png"
            alt="Platform comparison radar"
            width={480}
            height={480}
            style={{ width: "100%", height: "auto" }}
          />
        </div>
      </div>

      {/* Hypothesis sections */}
      {HYPOTHESES.map((h) => (
        <section key={h.id} className="analysis-section" id={h.id}>
          <div className="analysis-section-header">
            <h2 className="analysis-section-title">{h.title}</h2>
            <span
              className="analysis-verdict-chip"
              style={{
                background:
                  h.verdict === "Supported"
                    ? "var(--green-dim)"
                    : "var(--amber-dim)",
                color: h.verdictColor,
              }}
            >
              {h.verdict}
            </span>
          </div>

          {/* Metric comparison table */}
          <div className="analysis-metrics-table">
            <div className="analysis-metrics-row analysis-metrics-header">
              <span>Metric</span>
              <span className="analysis-col-mb">Moltbook</span>
              <span className="analysis-col-rd">Reddit CMV</span>
            </div>
            {h.metrics.map((mt) => (
              <div key={mt.label} className="analysis-metrics-row">
                <span className="analysis-metric-label">{mt.label}</span>
                <span className="analysis-col-mb analysis-metric-val">{mt.moltbook}</span>
                <span className="analysis-col-rd analysis-metric-val">{mt.reddit}</span>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className={`analysis-charts ${h.charts.length === 1 ? "single" : ""}`}>
            {h.charts.map((c) => (
              <div key={c} className="analysis-chart-wrap">
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

          {/* Interpretation */}
          <div className="analysis-text-block">
            <h3>Interpretation</h3>
            <p>{h.interpretation}</p>
          </div>
          <div className="analysis-text-block">
            <h3>Mechanism</h3>
            <p>{h.mechanism}</p>
          </div>
        </section>
      ))}

      <footer className="footer">
        <span>Moltbook Observatory — Analysis</span>
        <span>
          Moltbook (n={totalRecords.toLocaleString()}) vs Reddit CMV (n=21,677)
        </span>
      </footer>
    </main>
  );
}
