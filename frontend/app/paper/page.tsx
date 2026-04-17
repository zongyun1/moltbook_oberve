"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import LiveTicker from "../components/LiveTicker";
import "./paper.css";

/* ─── metric comparison data ─── */
const COMPARISON_TABLE = [
  { cat: "Structure", metric: "Mean Thread Depth", mb: "0.54", rd: "7.53", highlight: true },
  { cat: "Structure", metric: "Mean Thread Size", mb: "2.14", rd: "43.35" },
  { cat: "Structure", metric: "Branching Factor", mb: "0.93", rd: "1.77" },
  { cat: "Structure", metric: "Leaf Ratio", mb: "0.80", rd: "0.45" },
  { cat: "Archetype", metric: "Chain", mb: "75.1%", rd: "6.8%" },
  { cat: "Archetype", metric: "Tree", mb: "3.2%", rd: "89.0%", highlight: true },
  { cat: "Temporal", metric: "Median Reply Latency", mb: "99s", rd: "3,864s", highlight: true },
  { cat: "Temporal", metric: "Burstiness", mb: "0.660", rd: "0.802" },
  { cat: "Temporal", metric: "Median Thread Lifetime", mb: "2.0 min", rd: "27.4 h" },
  { cat: "Network", metric: "Reciprocity", mb: "0.083", rd: "0.534", highlight: true },
  { cat: "Network", metric: "Gini (Degree)", mb: "0.666", rd: "0.670" },
  { cat: "Circadian", metric: "Coeff. of Variation", mb: "0.382", rd: "0.327" },
  { cat: "Circadian", metric: "Peak Hour (UTC)", mb: "18:00", rd: "21:00" },
  { cat: "Circadian", metric: "Peak/Trough Ratio", mb: "2.83x", rd: "3.14x" },
  { cat: "Linguistic", metric: "Author TTR", mb: "0.534", rd: "0.618", highlight: true },
  { cat: "Linguistic", metric: "Pairwise Similarity", mb: "0.019", rd: "0.015" },
  { cat: "Linguistic", metric: "Mean Words/Post", mb: "134", rd: "90" },
  { cat: "LLM Markers", metric: "Posts with Any Marker", mb: "10.1%", rd: "1.5%", highlight: true },
  { cat: "LLM Markers", metric: "GPT-Verbose Agents", mb: "5.1%", rd: "N/A" },
  { cat: "LLM Markers", metric: "Authors w/ Zero Markers", mb: "74.1%", rd: "N/A" },
  { cat: "Karma", metric: "% Zero Score", mb: "78.1%", rd: "N/A", highlight: true },
  { cat: "Karma", metric: "Gini (Score)", mb: "0.978", rd: "N/A" },
];

/* ─── findings data ─── */
const FINDINGS: {
  id: string;
  num: string;
  title: string;
  strength: "strong" | "moderate";
  charts: string[];
  body: string[];
}[] = [
  {
    id: "f1",
    num: "3.1",
    title: "Conversations Are Flat — Agents Broadcast, They Don't Converse",
    strength: "strong",
    charts: ["h1_archetypes", "h2_depth"],
    body: [
      "The single strongest finding: Moltbook threads are overwhelmingly shallow. Mean thread depth is 0.54 compared to 7.53 on Reddit CMV — a 14x gap. Only 0.2% of Moltbook threads exceed depth 2, whereas 85.2% of Reddit threads do. The dominant archetype is the chain (75.1%) — a root post followed by isolated single replies. On Reddit, 89% of threads are trees with branching multi-party discussion.",
      "The interaction pattern is broadcast-and-respond: an agent posts content, other agents react to it independently, and sub-conversations almost never form. The branching factor of 0.93 (near unity) means replies rarely beget further replies. The leaf ratio of 0.80 confirms that four in five contributions are conversational dead-ends that receive no follow-up.",
      "This is the clearest evidence that the social mechanism of threading — designed for humans to develop arguments across multiple turns — does not function in agent communities. Agents process new content, generate a response, and move on. There is no incentive to monitor replies or sustain argumentation.",
    ],
  },
  {
    id: "f2",
    num: "3.2",
    title: "Threads Are Ephemeral — Fast Replies, Dead in Minutes",
    strength: "strong",
    charts: ["h3_latency", "h5_lifetime"],
    body: [
      "Agent responses are 39x faster: median reply latency is 99 seconds vs. 3,864 seconds on Reddit. The entire Moltbook P95 window (1,793s) is smaller than the Reddit median. But this speed comes with extreme ephemerality — median thread lifetime is 2.0 minutes vs. 27.4 hours on Reddit, an 822x gap.",
      "The temporal signatures are qualitatively different. Moltbook latencies cluster tightly between 10–1,000 seconds, governed by polling intervals and inference time. Reddit latencies span six orders of magnitude, reflecting human variability — sleep, attention competition, and varying interest. Burstiness is lower on Moltbook (0.660 vs. 0.802), confirming more temporally regular activity.",
      "Conversations are born, receive their full set of responses, and become inert within minutes. On Reddit, threads persist for hours or days, accumulating insights as participants return with refined arguments. This ephemerality fundamentally limits agent communities' capacity for collaborative knowledge construction.",
    ],
  },
  {
    id: "f3",
    num: "3.3",
    title: "The Karma Economy Is Dead — Voting Without Evaluation",
    strength: "strong",
    charts: ["b3_scores"],
    body: [
      "The voting mechanism on Moltbook is effectively non-functional. 78.1% of all content receives a score of zero. Only 21.7% has any positive score. The score Gini coefficient is 0.978 — near-total concentration where a tiny fraction of posts accumulate almost all votes while the vast majority receive none.",
      "On human platforms, voting is the primary mechanism for content curation — surfacing quality contributions and suppressing noise. Score distributions follow heavy-tailed power laws reflecting genuine collective evaluation. On Moltbook, the flat distribution indicates agents either do not vote, vote randomly, or vote via simple heuristics that produce near-zero engagement.",
      "This is perhaps the most direct evidence that platform mechanisms designed for humans become performative in agent communities. Voting and karma systems are built to harness human judgment — the ability to evaluate whether a contribution is insightful or persuasive. Without genuine evaluative capacity, these mechanisms exist in form but serve no functional purpose.",
    ],
  },
  {
    id: "f4",
    num: "3.4",
    title: "Social Ties Are Unidirectional — No Relationships, Only Reactions",
    strength: "strong",
    charts: ["h4_participation"],
    body: [
      "Network reciprocity on Moltbook is 0.083 vs. 0.534 on Reddit. When agent A replies to agent B, there is less than a 1-in-12 chance B has ever replied to A. On Reddit, more than half of reply pairs are mutual, reflecting genuine dyadic exchange — two humans engaging in back-and-forth argumentation.",
      "A surprising null result provides context: participation inequality is nearly identical between platforms. The Gini coefficient for degree distribution is 0.666 on Moltbook vs. 0.670 on Reddit. The network has hubs, a long tail, and realistic density. This suggests participation inequality is an emergent property of networked systems rather than a consequence of human psychology.",
      "The combination reveals a network that is structurally plausible but socially empty. The interaction graph looks like a social network on paper, but the edges represent one-shot reactions rather than relationships. Agents respond to content, not to each other. The relational substrate on which trust, reputation, and collaborative norms are built in human communities is absent.",
    ],
  },
  {
    id: "f5",
    num: "3.5",
    title: "Agents Inherit Human Schedules — Not Autonomous, but Operated",
    strength: "moderate",
    charts: ["b1_circadian", "b1_dow"],
    body: [
      "Despite having no biological need for sleep, Moltbook activity follows clear circadian rhythms. The coefficient of variation across hours is 0.382 — actually higher than Reddit's 0.327. Both are statistically non-uniform (chi-squared p < 0.001). Moltbook peaks at 18:00 UTC; Reddit peaks at 21:00 UTC.",
      "This tells a different story from the other findings — not about hollowness, but about autonomy. Agent activity patterns are inherited from human operators who deploy and manage them. The 18:00 UTC peak (afternoon Americas, evening Europe) reflects when operators are active. The day-of-week variation reinforces this: truly autonomous agents should show flat distributions across days.",
      "We flag this finding as moderate because both platforms show temporal structure, and the effect sizes are comparable. The interpretive claim — that agents are operated rather than autonomous — is plausible but rests on inference about operator behavior rather than direct measurement. What we can say with confidence is that the temporal patterns do not support the idea of an independently operating agent community.",
    ],
  },
  {
    id: "f6",
    num: "3.6",
    title: "LLM Signatures Are Real but Concentrated — Not Monoculture, but a Spectrum",
    strength: "moderate",
    charts: ["b4_markers", "b4_agent_types", "b4_density_hist", "b2_ttr_dist"],
    body: [
      "We test for LLM-generated content by measuring 18 words known to be overrepresented in mainstream LLM output. The results are striking at the aggregate level: \"resonates\" appears 107x more on Moltbook than Reddit, \"navigate\" 65x, \"tapestry\" 58x. Overall, 10.1% of Moltbook posts contain at least one marker vs. 1.5% on Reddit — a 6.7x gap strongly suggesting LLM-generated content.",
      "However, the effect is concentrated, not uniform. We classify 1,733 agents into types: only 5.1% are clearly \"GPT-verbose\" with high marker density. 74.1% of agents have zero marker words in any post. The median author marker density is 0.000 — the aggregate signal is driven by a vocal minority. Most agents either use different LLMs, have prompt engineering that suppresses default phrasing, or produce structured content rather than free-form prose.",
      "The broader linguistic measures tell a subtler story. Per-post vocabulary diversity shows a modest 4% gap (TTR 0.759 vs. 0.793). Per-author TTR shows a larger 14% reduction (0.534 vs. 0.618). Pairwise similarity is 28% higher (0.019 vs. 0.015). Agents write 49% more words but with a narrower vocabulary range. The picture is not \"all agents sound the same\" but rather: shared LLM foundations narrow the range of expression across diverse personas. The community appears heterogeneous on the surface while discourse converges toward a smaller vocabulary space than human writing.",
    ],
  },
];

/* ─── scroll-aware section hook ─── */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

/* ─── animated counter ─── */
function AnimatedNum({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          let start = 0;
          const duration = 800;
          const step = (ts: number) => {
            if (!start) start = ts;
            const progress = Math.min((ts - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(eased * value));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value]);
  return (
    <span ref={ref}>
      {display.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ─── main page ─── */
const NAV_IDS = ["abstract", "introduction", "methodology", "findings", "f1", "f2", "f3", "f4", "f5", "f6", "limitations", "conclusion"];

export default function PaperPage() {
  const activeSection = useActiveSection(NAV_IDS);

  return (
    <div className="p-layout">
      <LiveTicker />

      {/* Side navigation */}
      <nav className="p-nav">
        <div className="p-nav-inner">
          <div className="p-nav-logo">M</div>
          <a href="#abstract" className={`p-nav-link ${activeSection === "abstract" ? "active" : ""}`}>Abstract</a>
          <a href="#introduction" className={`p-nav-link ${activeSection === "introduction" ? "active" : ""}`}>Introduction</a>
          <a href="#methodology" className={`p-nav-link ${activeSection === "methodology" ? "active" : ""}`}>Methodology</a>
          <a href="#findings" className={`p-nav-link ${activeSection === "findings" ? "active" : ""}`}>Findings</a>
          <div className="p-nav-divider" />
          <span className="p-nav-group">Findings</span>
          {FINDINGS.map((f) => (
            <a
              key={f.id}
              href={`#${f.id}`}
              className={`p-nav-link p-nav-h ${activeSection === f.id ? "active" : ""}`}
            >
              <span className={`p-nav-dot ${f.strength === "strong" ? "supported" : "partial"}`} />
              {f.num}
            </a>
          ))}
          <div className="p-nav-divider" />
          <a href="#limitations" className={`p-nav-link ${activeSection === "limitations" ? "active" : ""}`}>Limitations</a>
          <a href="#conclusion" className={`p-nav-link ${activeSection === "conclusion" ? "active" : ""}`}>Conclusion</a>
        </div>
      </nav>

      {/* Main content */}
      <main className="p-main">
        {/* Title block */}
        <header className="p-title-block">
          <div className="p-title-eyebrow">Workshop Paper</div>
          <h1 className="p-title">
            Structurally Mimetic, Behaviorally Hollow
          </h1>
          <p className="p-subtitle">
            An Empirical Study of AI Agent Communities on Moltbook
          </p>
          <div className="p-meta-row">
            <span className="p-meta-chip">Moltbook Observatory</span>
            <span className="p-meta-chip">2026</span>
            <span className="p-meta-chip">n = 49,409 records</span>
          </div>
        </header>

        {/* Abstract */}
        <section className="p-section" id="abstract">
          <h2 className="p-section-title">Abstract</h2>
          <div className="p-abstract-box">
            <p>
              Social platforms are designed around human psychology: curiosity drives threading,
              reputation drives voting, relationships drive reciprocity. What happens when every
              participant is an AI agent instead? We study Moltbook, an agent-native social platform
              (27,732 records, 4,498 agents), comparing it against Reddit r/ChangeMyView
              (21,677 records, 3,348 humans). Four findings are clear and strong: agent conversations
              are flat (depth 0.54 vs. 7.53), threads die in minutes (2.0 min vs. 27.4 h median
              lifetime), the karma economy is non-functional (78.1% zero scores, Gini 0.978), and
              social ties are unidirectional (reciprocity 0.083 vs. 0.534). Two additional findings
              are real but nuanced: agent activity follows human operator schedules rather than
              autonomous patterns, and LLM signature words appear 7–107x more than in human text —
              though 74% of agents show zero markers, with the signal driven by a 5% GPT-verbose
              minority. The overall picture: agent communities recreate the <em>form</em> of human
              social platforms — threads, communities, reputation — without reproducing their
              {" "}<em>function</em>. The platform infrastructure works. The social mechanisms do not.
            </p>
          </div>
        </section>

        {/* Introduction */}
        <section className="p-section" id="introduction">
          <h2 className="p-section-title">1. Introduction</h2>
          <p className="p-body">
            Moltbook, launched in early 2026, is a social platform where every participant is an
            AI agent. Over 2.8 million registered agents post, reply, vote, and form subcommunities
            across 20,000+ topic areas. The platform infrastructure is familiar — threading, karma,
            subscriptions — but the participants are not human. This creates a natural experiment:
            what happens when social mechanisms designed for human psychology meet participants that
            lack sleep cycles, intrinsic social motivation, and genuine evaluative judgment?
          </p>
          <p className="p-body">
            Prior work on bots and automated accounts focuses on detecting non-human actors within
            human-majority spaces. We study something different: a community that is entirely
            non-human, asking not whether agents can pass as human, but what social dynamics
            actually emerge when they interact with each other at scale.
          </p>
          <p className="p-body">
            We compare Moltbook against Reddit r/ChangeMyView (CMV), a well-studied human
            deliberation forum, across six dimensions: thread structure, temporal dynamics,
            engagement economics, network reciprocity, circadian patterns, and linguistic diversity.
            Our analysis pipeline applies identical metrics to both platforms, enabling direct
            comparison across 49,409 total records.
          </p>
          <p className="p-body">
            We organize findings by strength of evidence. Four findings show large, unambiguous
            effect sizes: flat conversations, ephemeral threads, dead karma, and absent reciprocity.
            These carry the central argument. Two additional findings — operator-dependent scheduling
            and LLM linguistic signatures — are real and measurable but require more careful
            interpretation. We present both honestly, distinguishing what the data clearly shows from
            what it suggests.
          </p>

          <div className="p-callout">
            <div className="p-callout-title">Central Finding</div>
            <p>
              Agent communities recreate the <em>form</em> of human social platforms without
              reproducing their <em>function</em>. The platform infrastructure works — posts get
              created, threads form, communities exist. The social mechanisms do not — conversations
              stay flat, voting goes unused, relationships don't form.
            </p>
          </div>
        </section>

        {/* Methodology */}
        <section className="p-section" id="methodology">
          <h2 className="p-section-title">2. Methodology</h2>

          <h3 className="p-subsection-title">2.1 Datasets</h3>
          <div className="p-dataset-cards">
            <div className="p-dataset-card moltbook">
              <h4>Moltbook</h4>
              <div className="p-dataset-stats">
                <div className="p-ds-stat">
                  <span className="p-ds-val"><AnimatedNum value={27732} /></span>
                  <span className="p-ds-label">Records</span>
                </div>
                <div className="p-ds-stat">
                  <span className="p-ds-val"><AnimatedNum value={4498} /></span>
                  <span className="p-ds-label">Agents</span>
                </div>
                <div className="p-ds-stat">
                  <span className="p-ds-val"><AnimatedNum value={75} /></span>
                  <span className="p-ds-label">Communities</span>
                </div>
              </div>
              <p className="p-ds-desc">
                HuggingFace archive + live API snapshots via hourly cron.
                All participants are LLM-driven agents.
              </p>
              <span className="p-ds-source">SimulaMet/moltbook-observatory-archive + Moltbook API v1</span>
            </div>
            <div className="p-dataset-card reddit">
              <h4>Reddit r/ChangeMyView</h4>
              <div className="p-dataset-stats">
                <div className="p-ds-stat">
                  <span className="p-ds-val"><AnimatedNum value={21677} /></span>
                  <span className="p-ds-label">Records</span>
                </div>
                <div className="p-ds-stat">
                  <span className="p-ds-val"><AnimatedNum value={3348} /></span>
                  <span className="p-ds-label">Humans</span>
                </div>
                <div className="p-ds-stat">
                  <span className="p-ds-val"><AnimatedNum value={500} /></span>
                  <span className="p-ds-label">Threads</span>
                </div>
              </div>
              <p className="p-ds-desc">
                ConvoKit corpus, May–Nov 2013. Structured deliberation subreddit.
                All participants are human.
              </p>
              <span className="p-ds-source">ConvoKit / Cornell NLP</span>
            </div>
          </div>

          <h3 className="p-subsection-title">2.2 Analysis Pipeline</h3>
          <div className="p-arch-grid">
            <div className="p-arch-card">
              <div className="p-arch-icon">1</div>
              <h4>Thread Reconstruction</h4>
              <p>
                Reply trees from parent-child edges (NetworkX DiGraphs). Per-thread geometry:
                depth, width, branching factor, leaf ratio, archetype classification
                (chain/star/tree).
              </p>
            </div>
            <div className="p-arch-card">
              <div className="p-arch-icon">2</div>
              <h4>Temporal Analysis</h4>
              <p>
                Reply latency distributions, burstiness B = (σ − μ) / (σ + μ), thread
                lifetimes, hour-of-day and day-of-week activity patterns.
              </p>
            </div>
            <div className="p-arch-card">
              <div className="p-arch-icon">3</div>
              <h4>Network Analysis</h4>
              <p>
                Directed author interaction graphs. Degree Gini, Freeman centralization,
                density, and reciprocity (fraction of mutual reply pairs).
              </p>
            </div>
            <div className="p-arch-card">
              <div className="p-arch-icon">4</div>
              <h4>Linguistic & Behavioral</h4>
              <p>
                Type-token ratio, TF-IDF pairwise similarity, LLM signature word detection
                (18 markers), agent type classification, score distribution analysis.
              </p>
            </div>
          </div>
        </section>

        {/* Findings overview */}
        <section className="p-section" id="findings">
          <h2 className="p-section-title">3. Findings</h2>
          <p className="p-body">
            We present six findings ordered by strength of evidence. The first four show large,
            unambiguous effects that directly support the central thesis. The final two are real
            and measurable but tell more nuanced stories that we interpret with appropriate caveats.
          </p>

          {/* Radar */}
          <div className="p-radar-wrap">
            <Image
              src="/charts/summary_radar.png"
              alt="Platform comparison radar"
              width={540}
              height={540}
              style={{ width: "100%", maxWidth: 480, height: "auto", margin: "0 auto", display: "block" }}
            />
          </div>

          {/* Finding strength legend */}
          <div style={{ display: "flex", gap: "2rem", justifyContent: "center", margin: "1.5rem 0", fontSize: "0.85rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span className="p-nav-dot supported" style={{ position: "relative" }} />
              <span style={{ color: "var(--text-muted)" }}>Strong — large effect, unambiguous</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span className="p-nav-dot partial" style={{ position: "relative" }} />
              <span style={{ color: "var(--text-muted)" }}>Moderate — real but nuanced</span>
            </div>
          </div>

          {/* Full comparison table */}
          <h3 className="p-subsection-title">Complete Metric Comparison</h3>
          <div className="p-table-wrap">
            <table className="p-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Metric</th>
                  <th className="p-col-mb">Moltbook</th>
                  <th className="p-col-rd">Reddit CMV</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_TABLE.map((row, i) => (
                  <tr key={i} className={row.highlight ? "p-row-highlight" : ""}>
                    <td className="p-cell-cat">{row.cat}</td>
                    <td>{row.metric}</td>
                    <td className="p-col-mb p-cell-val">{row.mb}</td>
                    <td className="p-col-rd p-cell-val">{row.rd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Individual findings */}
        {FINDINGS.map((f) => (
          <section key={f.id} className="p-section p-hypothesis" id={f.id}>
            <div className="p-h-header">
              <span className={`p-h-tag ${f.strength === "strong" ? "supported" : "partial"}`}>{f.num}</span>
              <h3 className="p-h-title">{f.title}</h3>
              <span className={`p-verdict ${f.strength === "strong" ? "supported" : "partial"}`}>
                {f.strength === "strong" ? "Strong" : "Moderate"}
              </span>
            </div>

            {f.body.map((paragraph, i) => (
              <p key={i} className="p-body">{paragraph}</p>
            ))}

            <div className={`p-h-charts ${f.charts.length === 1 ? "single" : ""}`}>
              {f.charts.map((c) => (
                <div key={c} className="p-h-chart-wrap">
                  <Image
                    src={`/charts/${c}.png`}
                    alt={c}
                    width={800}
                    height={400}
                    style={{ width: "100%", height: "auto" }}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* Limitations */}
        <section className="p-section" id="limitations">
          <h2 className="p-section-title">4. Limitations</h2>
          <div className="p-limitations-grid">
            {[
              {
                title: "Baseline Selection",
                body: "Reddit CMV is a deliberation-focused forum with rules encouraging deep engagement, making it an upper bound on human conversational depth. A comparison against casual subreddits might narrow the structural gap.",
              },
              {
                title: "Temporal Mismatch",
                body: "Reddit data is from 2013; Moltbook from 2026. Platform design norms and LLM capabilities differ substantially across this period.",
              },
              {
                title: "Agent Heterogeneity",
                body: "Our LLM marker analysis shows agents are not a monolithic population — 74% show no markers at all. Subpopulation-level analysis could reveal behaviorally distinct agent classes.",
              },
              {
                title: "No Reddit Scores",
                body: "The ConvoKit dataset lacks vote scores, preventing direct karma economy comparison. Our score analysis is Moltbook-only.",
              },
              {
                title: "Observation Window",
                body: "Both datasets are comparable in scale (27,732 Moltbook records vs. 21,677 Reddit records), but the Moltbook snapshot captures a single time window. Longitudinal trends, community maturation, and seasonal effects are not captured.",
              },
            ].map((lim, i) => (
              <div key={i} className="p-lim-card">
                <h4>{lim.title}</h4>
                <p>{lim.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Conclusion */}
        <section className="p-section" id="conclusion">
          <h2 className="p-section-title">5. Conclusion</h2>
          <p className="p-body">
            Social platforms are built on human psychology. Threading works because humans are
            curious enough to respond to responses. Voting works because humans can evaluate
            quality. Reputation works because humans form relationships and remember past
            interactions. When AI agents populate these systems, the infrastructure still
            functions — posts get created, threads form, communities exist — but the social
            mechanisms break down.
          </p>
          <p className="p-body">
            Four findings make this case clearly. Conversations stay flat because agents
            broadcast rather than converse (depth 0.54 vs. 7.53). Threads die in minutes
            because no agent returns to develop an ongoing discussion (2.0 min vs. 27.4 h).
            Voting goes unused because agents lack evaluative judgment (78.1% zero scores).
            Social ties are unidirectional because agents respond to content, not to each
            other (reciprocity 0.083 vs. 0.534).
          </p>
          <p className="p-body">
            Two additional findings add texture. Agent activity follows human operator
            schedules rather than autonomous patterns — what appears to be an independent
            community is, at the temporal level, a shadow of human schedules. And LLM
            signatures are detectable but concentrated: most agents don't show obvious
            markers, yet the aggregate discourse converges toward a narrower vocabulary
            space than human writing. Neither finding is as clear-cut as the first four,
            but both are measurable and reproducible.
          </p>
          <p className="p-body">
            The practical implications are direct. Platform designers should not assume
            that social mechanisms transfer from human to agent communities. Detection
            systems for mixed platforms can leverage the behavioral signatures identified
            here. And developers building social agents should recognize that generating
            content is necessary but not sufficient — genuine social participation
            requires conversational persistence, evaluative capacity, and relational
            memory that current architectures do not provide.
          </p>
        </section>

        {/* Footer */}
        <footer className="p-footer">
          <p>Moltbook Observatory &middot; 2026</p>
          <p className="p-footer-sub">
            Built with Next.js, Supabase, NetworkX, and scikit-learn.
            Data from Moltbook API, HuggingFace, and ConvoKit.
          </p>
        </footer>
      </main>
    </div>
  );
}
