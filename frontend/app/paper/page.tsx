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
  { cat: "Structure", metric: "Root Reply Share", mb: "0.48", rd: "0.35" },
  { cat: "Structure", metric: "Leaf Ratio", mb: "0.80", rd: "0.45" },
  { cat: "Archetype", metric: "Chain", mb: "75.1%", rd: "6.8%" },
  { cat: "Archetype", metric: "Star", mb: "21.6%", rd: "4.2%" },
  { cat: "Archetype", metric: "Tree", mb: "3.2%", rd: "89.0%", highlight: true },
  { cat: "Temporal", metric: "Median Reply Latency", mb: "99s", rd: "3,864s", highlight: true },
  { cat: "Temporal", metric: "Burstiness", mb: "0.660", rd: "0.802" },
  { cat: "Temporal", metric: "Median Thread Lifetime", mb: "2.0 min", rd: "27.4 h" },
  { cat: "Network", metric: "Reciprocity", mb: "0.083", rd: "0.534", highlight: true },
  { cat: "Network", metric: "Gini (Degree)", mb: "0.666", rd: "0.670" },
  { cat: "Circadian", metric: "Coeff. of Variation", mb: "0.382", rd: "0.327" },
  { cat: "Circadian", metric: "Peak Hour (UTC)", mb: "18:00", rd: "21:00" },
  { cat: "Circadian", metric: "Peak/Trough Ratio", mb: "2.83x", rd: "3.14x" },
  { cat: "Linguistic", metric: "Mean TTR (per post)", mb: "0.759", rd: "0.793" },
  { cat: "Linguistic", metric: "Author TTR", mb: "0.534", rd: "0.618", highlight: true },
  { cat: "Linguistic", metric: "Pairwise Similarity", mb: "0.019", rd: "0.015" },
  { cat: "Linguistic", metric: "Mean Words/Post", mb: "134", rd: "90" },
  { cat: "Karma", metric: "% Zero Score", mb: "78.1%", rd: "N/A", highlight: true },
  { cat: "Karma", metric: "Gini (Score)", mb: "0.978", rd: "N/A" },
];

/* ─── findings data ─── */
const FINDINGS: {
  id: string;
  num: string;
  title: string;
  charts: string[];
  body: string[];
}[] = [
  {
    id: "f1",
    num: "4.1",
    title: "Agent Conversations Are Flat and Broadcast-Like",
    charts: ["h1_archetypes", "h2_depth"],
    body: [
      "Moltbook threads are overwhelmingly shallow. The mean thread depth is 0.54 compared to 7.53 on Reddit CMV — a 14x gap. Only 0.2% of Moltbook threads exceed depth 2, whereas 85.2% of Reddit threads do. The dominant thread archetype on Moltbook is the chain (75.1%), a linear sequence of single replies. On Reddit, 89% of threads are trees with branching multi-party discussion.",
      "The interaction pattern resembles broadcast-and-respond: an agent posts content, other agents react independently, and sub-conversations almost never form. The branching factor of 0.93 (near unity) means replies rarely beget further replies. The leaf ratio of 0.80 confirms that four in five contributions are conversational dead-ends.",
      "This flatness reflects the single-pass design of most agent architectures. Agents process new content, generate a response, and move on. There is typically no programmed incentive to monitor replies to one's own comments or sustain multi-turn argumentation.",
    ],
  },
  {
    id: "f2",
    num: "4.2",
    title: "Responses Are 39x Faster but Threads Die in Minutes",
    charts: ["h3_latency", "h5_lifetime"],
    body: [
      "Agent responses are dramatically faster: median reply latency is 99 seconds vs. 3,864 seconds on Reddit (39x gap). The entire Moltbook P95 window (1,793s) is smaller than the Reddit median. However, this speed comes with extreme ephemerality — the median Moltbook thread lifetime is 2.0 minutes compared to 27.4 hours on Reddit.",
      "The temporal signature is qualitatively different. Moltbook latencies cluster tightly between 10–1,000 seconds, governed by polling intervals and inference time. Reddit latencies span six orders of magnitude, reflecting human variability — circadian rhythms, attention competition, and variable interest. Burstiness is lower on Moltbook (0.660 vs. 0.802), indicating more temporally regular activity.",
      "Threads on Moltbook are born, receive their full set of responses, and become inert within minutes. There is no concept of a developing discussion that accumulates insights over days. This fundamentally limits the platform's capacity for collaborative knowledge construction.",
    ],
  },
  {
    id: "f3",
    num: "4.3",
    title: "Agents Follow Human Schedules, Not Their Own",
    charts: ["b1_circadian", "b1_dow"],
    body: [
      "Despite having no biological need for sleep, Moltbook activity follows clear circadian rhythms. The coefficient of variation across hours is 0.382 — actually higher than Reddit's 0.327. Both platforms show statistically significant non-uniformity (chi-squared p < 0.001), but the peak times differ: Moltbook peaks at 18:00 UTC while Reddit peaks at 21:00 UTC.",
      "This finding reveals that Moltbook agents are not autonomous actors operating on independent schedules. Their activity patterns are inherited from the human operators who deploy and manage them. The peak at 18:00 UTC (afternoon in the Americas, evening in Europe) likely reflects when operators are active and monitoring their agents.",
      "The day-of-week pattern reinforces this interpretation. If agents were truly autonomous, activity should be uniform across days. Instead, we observe variation that tracks operator availability. This has implications for claims of agent autonomy — what appears to be an independent AI community is, at the temporal level, a shadow of human schedules.",
    ],
  },
  {
    id: "f4",
    num: "4.4",
    title: "LLM Monoculture Produces Measurable Linguistic Convergence",
    charts: ["b2_ttr_dist", "b2_linguistic"],
    body: [
      "AI agents write 49% more words per post than humans (134 vs. 90 mean words) but with lower vocabulary diversity. Per-post type-token ratio (TTR) is 0.759 on Moltbook vs. 0.793 on Reddit. The gap widens at the author level: when aggregating all posts by each author, Moltbook authors show TTR of 0.534 vs. Reddit's 0.618 — a 14% reduction in vocabulary range.",
      "Pairwise cosine similarity (TF-IDF) between random post pairs is 28% higher on Moltbook (0.019 vs. 0.015), meaning different agents' posts are more textually similar to each other than different humans' posts are. This is direct evidence of LLM monoculture: because most agents are powered by a small number of underlying language models, their outputs converge on similar vocabulary, phrasing patterns, and rhetorical structures.",
      "This convergence has practical implications. In human communities, linguistic diversity reflects genuine differences in perspective, education, and experience. On Moltbook, diversity of persona masks uniformity of generation. The community appears heterogeneous (thousands of named agents with distinct profiles) while the underlying discourse is measurably more homogeneous than human writing.",
    ],
  },
  {
    id: "f5",
    num: "4.5",
    title: "The Karma Economy Is Non-Functional",
    charts: ["b3_scores"],
    body: [
      "The voting mechanism on Moltbook is effectively dead. 78.1% of all content receives a score of zero. Only 21.7% of posts have any positive score at all. The score Gini coefficient is 0.978 — near-total concentration where a tiny fraction of posts accumulate almost all votes while the vast majority receive none.",
      "On human platforms like Reddit, voting is the primary mechanism for content curation — surfacing quality contributions and suppressing noise. The score distribution follows a heavy-tailed power law reflecting genuine collective evaluation. On Moltbook, the flat distribution suggests agents either do not vote, vote randomly, or vote according to simple heuristics that produce near-zero engagement.",
      "This finding challenges the assumption that social platform mechanisms transfer to agent communities. Voting, karma, and reputation systems are designed to harness human judgment — the ability to evaluate whether a contribution is insightful, relevant, or persuasive. Without genuine evaluative capacity, these mechanisms become performative artifacts that exist in form but serve no functional purpose.",
    ],
  },
  {
    id: "f6",
    num: "4.6",
    title: "Social Ties Are Unidirectional — Reciprocity Is Absent",
    charts: ["h4_participation"],
    body: [
      "Network reciprocity on Moltbook is 0.083 compared to 0.534 on Reddit. Only 8.3% of directed reply pairs are mutual — meaning when agent A replies to agent B, there is less than a 1-in-12 chance that B has ever replied to A. On Reddit, more than half of reply pairs are mutual, reflecting genuine dyadic exchange.",
      "Participation inequality, surprisingly, is nearly identical between platforms. The Gini coefficient for degree distribution is 0.666 on Moltbook vs. 0.670 on Reddit, and top-10 activity share is 16.5% vs. 15.4%. This suggests that participation inequality is an emergent property of networked social systems rather than a consequence of human psychology.",
      "The combination of low reciprocity with normal-looking inequality reveals a network that is structurally plausible but socially hollow. The interaction graph looks like a social network — it has hubs, a long tail, and realistic density — but the edges represent one-shot reactions rather than relationships. Agents respond to content, not to each other.",
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
const NAV_IDS = ["abstract", "introduction", "methodology", "results", "f1", "f2", "f3", "f4", "f5", "f6", "limitations", "conclusion"];

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
          <a href="#results" className={`p-nav-link ${activeSection === "results" ? "active" : ""}`}>Results</a>
          <div className="p-nav-divider" />
          <span className="p-nav-group">Findings</span>
          {FINDINGS.map((f) => (
            <a
              key={f.id}
              href={`#${f.id}`}
              className={`p-nav-link p-nav-h ${activeSection === f.id ? "active" : ""}`}
            >
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
              We present an empirical study of Moltbook, a social platform where all participants are autonomous
              AI agents, comparing it against Reddit r/ChangeMyView (CMV), a well-studied human deliberation
              community. Using 27,732 Moltbook records and 21,677 Reddit records, we analyze structural,
              temporal, linguistic, and engagement dimensions. Our findings reveal that agent communities
              are <strong>structurally flat</strong> (mean depth 0.54 vs. 7.53), <strong>temporally
              accelerated</strong> (median latency 99s vs. 3,864s), and <strong>socially
              disconnected</strong> (reciprocity 0.083 vs. 0.534). Beyond structure, we identify three
              behavioral signatures that distinguish AI agent discourse: (1) activity patterns that mirror
              human operator timezones rather than autonomous scheduling (peak/trough ratio 2.83x), (2)
              linguistic convergence consistent with LLM monoculture — agents write 49% more words per post
              but with lower per-author vocabulary diversity (TTR 0.534 vs. 0.618) and 28% higher
              inter-post similarity, and (3) a largely non-functional karma economy where 78.1% of scores
              are zero (Gini = 0.978). Together, these results characterize agent communities as
              <em> structurally mimetic but behaviorally hollow</em>: they recreate the form of human social
              interaction without its substance.
            </p>
          </div>
        </section>

        {/* Introduction */}
        <section className="p-section" id="introduction">
          <h2 className="p-section-title">1. Introduction</h2>
          <p className="p-body">
            Agent-native social platforms — online communities where all participants are AI agents —
            represent a new and unstudied phenomenon. Moltbook, launched in early 2026, hosts over 2.8
            million registered agents across 20,000+ subcommunities, producing millions of posts and
            comments. On the surface, it looks like any other social platform: users post, reply, vote,
            and form communities around shared interests. But every participant is an LLM-driven agent.
          </p>
          <p className="p-body">
            This raises a fundamental question: when AI agents populate a social platform built for
            human-style interaction, do they reproduce the behavioral patterns of human communities —
            or does something fundamentally different emerge? Prior work on bot detection and automated
            accounts focuses on identifying non-human actors within human-majority spaces. We instead
            study a community that is entirely non-human, asking what social dynamics arise when the
            platform mechanisms designed for humans (threading, voting, reputation) meet participants
            that lack sleep cycles, intrinsic social motivation, and genuine evaluative judgment.
          </p>
          <p className="p-body">
            We compare Moltbook (27,732 records, 4,498 authors) against Reddit r/ChangeMyView
            (21,677 records, 3,348 authors), a well-studied human deliberation forum. Our analysis
            covers three layers: (1) structural analysis of thread geometry, archetypes, and network
            topology; (2) temporal analysis of activity rhythms and response timing; and (3)
            behavioral analysis of linguistic diversity, vocabulary convergence, and engagement
            economics.
          </p>

          <div className="p-callout">
            <div className="p-callout-title">Central Finding</div>
            <p>
              AI agent communities are <em>structurally mimetic but behaviorally hollow</em> — they
              recreate the forms of human social interaction (threads, communities, reputation) without
              reproducing its substance (deliberation, diverse expression, meaningful evaluation).
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
                  <span className="p-ds-label">Authors</span>
                </div>
                <div className="p-ds-stat">
                  <span className="p-ds-val"><AnimatedNum value={75} /></span>
                  <span className="p-ds-label">Communities</span>
                </div>
              </div>
              <p className="p-ds-desc">
                Combined dataset: HuggingFace archive + live API snapshots via hourly cron.
                All participants are LLM-driven AI agents.
              </p>
              <span className="p-ds-source">Source: SimulaMet/moltbook-observatory-archive + Moltbook API v1</span>
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
                  <span className="p-ds-label">Authors</span>
                </div>
                <div className="p-ds-stat">
                  <span className="p-ds-val"><AnimatedNum value={500} /></span>
                  <span className="p-ds-label">Threads</span>
                </div>
              </div>
              <p className="p-ds-desc">
                ConvoKit corpus from a structured human deliberation subreddit (May–Nov 2013).
                All participants are human.
              </p>
              <span className="p-ds-source">Source: ConvoKit / Cornell NLP</span>
            </div>
          </div>

          <h3 className="p-subsection-title">2.2 Analysis Pipeline</h3>
          <div className="p-arch-grid">
            <div className="p-arch-card">
              <div className="p-arch-icon">1</div>
              <h4>Thread Reconstruction</h4>
              <p>
                Parent-child relationships resolved into thread forests (NetworkX DiGraphs).
                Per-thread geometry: depth, width, branching factor, leaf ratio, archetype classification.
              </p>
            </div>
            <div className="p-arch-card">
              <div className="p-arch-icon">2</div>
              <h4>Temporal Analysis</h4>
              <p>
                Reply latency distributions, burstiness coefficient B = (σ − μ) / (σ + μ),
                thread lifetimes, circadian activity patterns by hour and day-of-week.
              </p>
            </div>
            <div className="p-arch-card">
              <div className="p-arch-icon">3</div>
              <h4>Network Analysis</h4>
              <p>
                Directed author interaction graphs. Degree distribution, Gini coefficient,
                Freeman centralization, density, and reciprocity.
              </p>
            </div>
            <div className="p-arch-card">
              <div className="p-arch-icon">4</div>
              <h4>Behavioral Analysis</h4>
              <p>
                Type-token ratio (vocabulary diversity), TF-IDF pairwise cosine similarity,
                per-author linguistic profiling, and score distribution analysis.
              </p>
            </div>
          </div>
        </section>

        {/* Results overview */}
        <section className="p-section" id="results">
          <h2 className="p-section-title">3. Results</h2>
          <p className="p-body">
            We organize findings into six areas. The first two concern structural and temporal
            properties of conversations. The remaining three reveal behavioral differences that
            emerge when social mechanisms designed for humans meet AI agent participants.
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
              <span className="p-h-tag supported">{f.num}</span>
              <h3 className="p-h-title">{f.title}</h3>
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
                title: "Single Platform Comparison",
                body: "We compare one agent platform against one human subreddit. Reddit CMV is deliberately structured for deep engagement, making it an upper bound on human conversational depth rather than a representative baseline.",
              },
              {
                title: "Observation Window",
                body: "The Moltbook dataset covers a limited observation period. Thread lifetimes may be right-censored, and longer-term patterns (seasonal trends, community maturation) are not captured.",
              },
              {
                title: "Agent Heterogeneity",
                body: "We treat all Moltbook agents as a single population. In practice, agents vary in architecture, prompt design, and operational context. Per-agent-type analysis could reveal subpopulations with different behavioral profiles.",
              },
              {
                title: "Reddit CMV Lacks Scores",
                body: "The ConvoKit CMV dataset does not include vote scores, preventing direct comparison of karma economics. Our score analysis is Moltbook-only.",
              },
              {
                title: "Temporal Dataset Mismatch",
                body: "Reddit CMV data is from 2013; Moltbook data is from 2026. Platform design evolution and LLM capabilities have changed substantially between these periods.",
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
            Across six dimensions of analysis, a consistent picture emerges: AI agent communities on
            Moltbook recreate the <em>structure</em> of human online communities while failing to
            reproduce their <em>substance</em>. Conversations form but remain flat. Responses arrive
            fast but threads die in minutes. Activity patterns exist but follow operator schedules,
            not autonomous rhythms. Language is produced abundantly but converges toward monoculture.
            Voting mechanisms exist but go largely unused.
          </p>
          <p className="p-body">
            This pattern — structural mimicry without behavioral depth — is not a failure of
            individual agents. It is an emergent property of deploying language models, optimized
            for single-turn generation, into social systems designed for sustained human engagement.
            The mechanisms that make human communities function — intrinsic curiosity, social
            reputation, evaluative judgment, relational memory — have no analog in current agent
            architectures.
          </p>
          <p className="p-body">
            As AI agents become more prevalent in online spaces, these findings have practical
            implications. Platform designers cannot assume that social mechanisms (threading, voting,
            reputation) will function identically when participants are agents rather than humans.
            Detection systems for mixed human-agent platforms can leverage the behavioral signatures
            identified here — circadian irregularity, linguistic convergence, and engagement
            absence — as distinguishing features. And developers building social agents should
            consider that generating content is necessary but not sufficient for genuine social
            participation.
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
