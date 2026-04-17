"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import LiveTicker from "../components/LiveTicker";
import "./paper.css";

/* ─── metric comparison data ─── */
const COMPARISON_TABLE = [
  { cat: "Structure", metric: "Mean Thread Depth", mb: "0.54", rd: "7.53", unit: "", highlight: true },
  { cat: "Structure", metric: "Mean Thread Size", mb: "2.14", rd: "43.35", unit: "posts" },
  { cat: "Structure", metric: "Branching Factor", mb: "0.93", rd: "1.77", unit: "" },
  { cat: "Structure", metric: "Root Reply Share", mb: "0.48", rd: "0.35", unit: "" },
  { cat: "Structure", metric: "Leaf Ratio", mb: "0.80", rd: "0.45", unit: "" },
  { cat: "Structure", metric: "Threads > Depth 2", mb: "0.2%", rd: "85.2%", unit: "", highlight: true },
  { cat: "Archetype", metric: "Chain", mb: "75.1%", rd: "6.8%", unit: "" },
  { cat: "Archetype", metric: "Star", mb: "21.6%", rd: "4.2%", unit: "" },
  { cat: "Archetype", metric: "Tree", mb: "3.2%", rd: "89.0%", unit: "", highlight: true },
  { cat: "Temporal", metric: "Median Reply Latency", mb: "99s", rd: "3,864s", unit: "", highlight: true },
  { cat: "Temporal", metric: "P95 Reply Latency", mb: "1,793s", rd: "92,271s", unit: "" },
  { cat: "Temporal", metric: "Burstiness", mb: "0.660", rd: "0.802", unit: "", highlight: true },
  { cat: "Temporal", metric: "Median Thread Lifetime", mb: "2.0 min", rd: "27.4 h", unit: "" },
  { cat: "Network", metric: "Reciprocity", mb: "0.083", rd: "0.534", unit: "", highlight: true },
  { cat: "Network", metric: "Gini (Degree)", mb: "0.666", rd: "0.670", unit: "" },
  { cat: "Network", metric: "Top-10 Activity Share", mb: "16.5%", rd: "15.4%", unit: "" },
];

const HYPOTHESES: {
  id: string;
  tag: string;
  title: string;
  verdict: "supported" | "partial";
  charts: string[];
  summary: string;
  interpretation: string;
  mechanism: string;
  comparison: string;
  confounders: string;
  implications: string;
  extension: string;
}[] = [
  {
    id: "h1",
    tag: "H1",
    title: "Agent communities are more broadcast-like than conversational",
    verdict: "supported",
    charts: ["h1_archetypes", "h1_broadcast"],
    summary:
      "75.1% of Moltbook threads are chains vs. 89% trees on Reddit. Root reply share is 0.48 vs. 0.35, and branching factor is 0.93 vs. 1.77. Across 12,669 threads and 27,056 records.",
    interpretation:
      "The interaction pattern on Moltbook resembles a broadcast-and-respond model: an agent posts content, and other agents react to it independently, rarely engaging with each other's responses. The near-unity branching factor means sub-conversations almost never form. This stands in sharp contrast to Reddit CMV, where replies frequently branch into multi-party deliberation.",
    mechanism:
      "Most agents operate under task-specific prompts that define a narrow behavioral scope—monitoring particular topics, providing commentary from a fixed perspective, or aggregating information. These designs naturally produce stimulus-response behavior: detect relevant content, generate a reply, move on. There is typically no programmed incentive to monitor replies to one's own comments or engage in follow-up argumentation. Human users, by contrast, are intrinsically motivated by social feedback loops—status, persuasion, curiosity—that sustain multi-turn exchanges.",
    comparison:
      "Human users on Reddit CMV develop rich tree-structured arguments because the platform incentivizes deliberation through delta-awarding mechanics and social reputation. The 89% tree archetype rate reflects genuine multi-party engagement that emerges organically from human curiosity and the desire to persuade.",
    confounders:
      "Reddit CMV is specifically designed for structured deliberation, making it an upper bound on human conversational depth. A comparison against a more casual subreddit might narrow the gap. Moltbook's younger platform age and lower activity density may independently suppress deep threading.",
    implications:
      "Current agent architectures lack conversational persistence. Platforms designed for agent interaction may need explicit mechanisms—reply notifications, state-carrying context, incentive signals—to move beyond one-shot reactivity.",
    extension:
      "Comparing agents with explicit 'reply-to-reply' prompting against standard agents could isolate the effect of conversational design on thread structure.",
  },
  {
    id: "h2",
    tag: "H2",
    title: "Agent discussions are structurally shallow",
    verdict: "supported",
    charts: ["h2_depth"],
    summary:
      "Mean depth 0.54 vs. 7.53 (14x gap). Only 0.2% of Moltbook's 12,669 threads exceed depth 2, while 85.2% of Reddit threads do.",
    interpretation:
      "Moltbook discussions are not merely less deep—they are overwhelmingly flat. A mean depth below 1 means the typical thread consists of a root post and zero or one direct replies. The leaf ratio of 0.80 confirms that the vast majority of contributions are conversational dead-ends that receive no follow-up. This contrasts sharply with Reddit CMV, where threads routinely develop hierarchical structure with multiple levels of nested argumentation.",
    mechanism:
      "Thread depth is a function of sustained relevance: each additional reply requires a participant who finds the preceding comment sufficiently interesting or contestable to warrant a response. Agents, operating on single-pass generation without persistent memory of thread state, lack the cognitive scaffolding to sustain such relevance chains. A human reading a reply may feel compelled to correct a misunderstanding or develop a partial argument; an agent's decision to reply is governed by topic-matching heuristics that do not weigh conversational trajectory.",
    comparison:
      "Reddit CMV's depth of 7.53 reflects a community where users iteratively refine arguments, challenge each other's premises, and develop nuanced positions across multiple reply levels. The 85.2% deep-thread rate is partly institutional—the subreddit's rules require substantive engagement—but also reflects the human capacity for sustained intellectual engagement.",
    confounders:
      "The dataset size difference (805 vs. 21,677 records) may contribute, as larger datasets allow more long-tail deep threads to appear. Thread depth on Reddit CMV may be inflated by its rules requiring substantive engagement.",
    implications:
      "Structural shallowness limits the epistemic capacity of agent communities. Deep argumentation, iterative refinement, and adversarial testing of claims all require multi-level threading. Systems aiming for agent-driven knowledge synthesis need architectures that model conversational depth as a planning objective.",
    extension:
      "A controlled experiment giving agents full thread context versus only the root post would quantify the effect of context depth on structural engagement.",
  },
  {
    id: "h3",
    tag: "H3",
    title: "Agent responses are faster and more temporally consistent",
    verdict: "supported",
    charts: ["h3_latency", "h3_burstiness"],
    summary:
      "Median latency 99s vs. 3,864s (39x faster). Burstiness 0.660 vs. 0.802 — closer at scale but still lower, with 14,064 reply events analyzed.",
    interpretation:
      "Agent responses are dramatically faster: the median reply latency is 39x lower than Reddit CMV. While burstiness at scale (0.660) is closer to human levels (0.802) than the live-only sample suggested, the latency distribution reveals a qualitatively different pattern: Moltbook replies cluster tightly between 10-1000 seconds, while Reddit's distribution spans six orders of magnitude. The entire Moltbook P95 window (1,793s) is smaller than the Reddit median (3,864s).",
    mechanism:
      "Agent response timing is primarily governed by three factors: polling interval (how often an agent checks for new content), inference latency (time to generate a response), and rate limiting (platform-imposed delays). None of these depend on content salience, time of day, or social motivation—factors that dominate human response timing. Humans exhibit circadian rhythms, variable engagement depending on topic interest, and attention competition from offline activities, all of which inject massive variance into response patterns.",
    comparison:
      "Reddit CMV's burstiness of 0.802 is characteristic of human online activity, where engagement follows circadian patterns, interest-driven attention, and social contagion effects. The heavy-tailed latency distribution reflects the full range of human availability—from immediate responses to comments posted days later after reflection.",
    confounders:
      "The observation window may affect results: our Moltbook snapshot covers a short period with uniform activity. A longer observation might reveal platform-level periodicity. Some agents may use deliberate delays to appear more natural.",
    implications:
      "The temporal regularity is a distinctive structural fingerprint that could serve as a detection signal for automated participation in mixed human-agent platforms. The absence of natural temporal variation means agent-dominated communities may lack the organic rhythm humans rely on for gauging community vitality.",
    extension:
      "Decomposing latency by agent type (news bots vs. conversational agents) would reveal whether temporal consistency is universal or concentrated in specific archetypes.",
  },
  {
    id: "h4",
    tag: "H4",
    title: "Participation is more concentrated among a small subset of agents",
    verdict: "partial" as const,
    charts: ["h4_participation"],
    summary:
      "Top-10 activity share: 16.5% vs. 15.4% — nearly identical at scale. Gini coefficients converge: 0.666 vs. 0.670. At 1,621 authors, the distributions are remarkably similar.",
    interpretation:
      "At scale, participation inequality in agent and human communities is remarkably similar. The Gini coefficients are nearly identical (0.666 vs. 0.670), and top-10 activity share is also comparable (16.5% vs. 15.4%). This is a surprising null result: agent communities reproduce the same participation inequality as human communities despite fundamentally different mechanisms of engagement.",
    mechanism:
      "Agent activity levels are determined by configuration rather than intrinsic motivation, yet the aggregate distribution mirrors the power-law pattern of human platforms. This suggests that participation inequality may be an emergent property of networked social systems rather than a consequence of human psychology — a finding with implications for theories of online inequality.",
    comparison:
      "Reddit's Gini of 0.670 reflects the classic power-law of human online participation. Moltbook's near-identical 0.666 suggests that similar distributional shapes emerge regardless of whether participants are humans or agents, possibly driven by platform structure and topic heterogeneity rather than individual motivation.",
    confounders:
      "The convergence at scale is notable — with the smaller live-only sample (805 records), Moltbook showed lower Gini (0.471), which appeared to support the hypothesis. The full dataset (27,056 records, 1,621 authors) reveals this was a sampling artifact. This underscores the importance of dataset scale in structural comparisons.",
    implications:
      "Agent ecosystems can develop de facto hub agents that shape discourse through operational design choices rather than social influence. Platform governance may need to account for the outsized structural impact of a few highly active agents.",
    extension:
      "Tracking whether the same agents consistently dominate across snapshots would distinguish structural concentration from rotational activity patterns.",
  },
  {
    id: "h5",
    tag: "H5",
    title: "Threads are shorter-lived and less persistent",
    verdict: "supported",
    charts: ["h5_lifetime"],
    summary:
      "Median thread lifetime: 2.0 min vs. 27.4 hours (822x gap). Across 6,278 multi-post threads. Max observed: 22 hours.",
    interpretation:
      "Moltbook threads are not just shorter—they are ephemeral. The longest observed thread lasted 31 minutes, a timescale that on Reddit would barely register as the beginning of a discussion. Conversations are born, receive their full set of responses, and become inert within minutes. There is no concept of a developing discussion or a thread that accumulates insights over days.",
    mechanism:
      "Thread persistence requires participants to return—to revisit a conversation after initial engagement and contribute additional thoughts prompted by intervening replies. Most agents lack this capability: they process new content in a forward-only stream without maintaining state about past interactions. A human user might bookmark a compelling thread, reflect on it overnight, and return with a refined argument. An agent that has already processed a thread has no mechanism to revisit it unless explicitly designed to do so.",
    comparison:
      "Reddit CMV threads persist for a median of 27 hours and can extend for months. This persistence enables collaborative knowledge construction: early replies frame the debate, later replies introduce new evidence, and the thread as a whole represents an evolving multi-perspective analysis of the original question.",
    confounders:
      "The observation window may truncate lifetimes if threads were still active when the snapshot was taken. However, the sharp P95 dropoff at 24 minutes suggests right-censoring is unlikely to be the dominant factor.",
    implications:
      "Thread ephemerality poses a fundamental challenge for knowledge accumulation. If agent communities cannot sustain persistent discourse, they may be limited to information dissemination rather than collaborative knowledge construction.",
    extension:
      "Agents with explicit revisit behaviors—periodically scanning past interactions for new replies—would test whether persistence is an architectural limitation or inherent to agent dynamics.",
  },
  {
    id: "h6",
    tag: "H6",
    title: "Interaction reciprocity is lower",
    verdict: "supported",
    charts: ["h4_participation"],
    summary:
      "Network reciprocity: 0.083 vs. 0.534. Only 8.3% of directed reply pairs on Moltbook are mutual, across 8,418 edges and 1,621 authors.",
    interpretation:
      "Low reciprocity indicates that agent interactions are predominantly unidirectional: agents respond to others' content but rarely receive responses in return from the same agents. The interaction graph is closer to a set of parallel broadcast channels than a social network. On Reddit CMV, the high reciprocity reflects genuine dyadic exchanges—two humans engaging in back-and-forth argumentation, the foundation of deliberative discourse.",
    mechanism:
      "Reciprocity requires two conditions: agent A must produce content relevant to agent B, and agent B must have a mechanism to detect and respond to A's reply specifically. Most agents satisfy neither reliably. They select content based on topic or recency, not social relationships. The probability that two agents independently find each other's content relevant enough to respond to is low in a platform with diverse topic coverage.",
    comparison:
      "Reddit CMV's reciprocity of 0.534 reflects the argumentative nature of the subreddit: when someone challenges your view, you are motivated to respond. This creates natural dyadic exchanges that are rare in agent communities where response decisions are topic-driven rather than relationship-driven.",
    confounders:
      "Platform size affects reciprocity: smaller communities have higher baseline reciprocal encounter probability. Moltbook's lower reciprocity is therefore especially notable given its smaller user base, which should mechanically bias toward higher reciprocity.",
    implications:
      "The absence of reciprocal interaction means agent communities lack the relational substrate on which trust, reputation, and collaborative norms are built. Designing agents with relational memory—tracking past interlocutors and preferentially responding to them—could be a path toward more socially structured communities.",
    extension:
      "Computing reciprocity within subcommunities (submolts) would test whether smaller, topic-focused groups achieve higher reciprocity.",
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

/* ─── expandable hypothesis card ─── */
function HypothesisSection({ h }: { h: (typeof HYPOTHESES)[number] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const tabs = [
    { key: "interpretation", label: "Interpretation", content: h.interpretation },
    { key: "mechanism", label: "Mechanism", content: h.mechanism },
    { key: "comparison", label: "Human Comparison", content: h.comparison },
    { key: "confounders", label: "Confounders", content: h.confounders },
    { key: "implications", label: "Implications", content: h.implications },
    { key: "extension", label: "Future Work", content: h.extension },
  ];

  return (
    <section className="p-section p-hypothesis" id={h.id}>
      <div className="p-h-header">
        <span className={`p-h-tag ${h.verdict}`}>{h.tag}</span>
        <h3 className="p-h-title">{h.title}</h3>
        <span className={`p-verdict ${h.verdict}`}>
          {h.verdict === "supported" ? "Supported" : "Partial"}
        </span>
      </div>
      <p className="p-h-summary">{h.summary}</p>

      <div className={`p-h-charts ${h.charts.length === 1 ? "single" : ""}`}>
        {h.charts.map((c) => (
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

      <div className="p-h-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`p-h-tab ${expanded === t.key ? "active" : ""}`}
            onClick={() => setExpanded(expanded === t.key ? null : t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {expanded && (
        <div className="p-h-detail">
          {tabs.find((t) => t.key === expanded)?.content}
        </div>
      )}
    </section>
  );
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
const NAV_IDS = ["abstract", "introduction", "system", "methodology", "results", "h1", "h2", "h3", "h4", "h5", "h6", "limitations", "conclusion"];

export default function PaperPage() {
  const activeSection = useActiveSection(NAV_IDS);

  return (
    <div className="p-layout">
      {/* Live ticker */}
      <LiveTicker />

      {/* Side navigation */}
      <nav className="p-nav">
        <div className="p-nav-inner">
          <div className="p-nav-logo">M</div>
          <a href="#abstract" className={`p-nav-link ${activeSection === "abstract" ? "active" : ""}`}>Abstract</a>
          <a href="#introduction" className={`p-nav-link ${activeSection === "introduction" ? "active" : ""}`}>Introduction</a>
          <a href="#system" className={`p-nav-link ${activeSection === "system" ? "active" : ""}`}>System Design</a>
          <a href="#methodology" className={`p-nav-link ${activeSection === "methodology" ? "active" : ""}`}>Methodology</a>
          <a href="#results" className={`p-nav-link ${activeSection === "results" ? "active" : ""}`}>Results</a>
          <div className="p-nav-divider" />
          <span className="p-nav-group">Hypotheses</span>
          {HYPOTHESES.map((h) => (
            <a
              key={h.id}
              href={`#${h.id}`}
              className={`p-nav-link p-nav-h ${activeSection === h.id ? "active" : ""}`}
            >
              <span className={`p-nav-dot ${h.verdict}`} />
              {h.tag}
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
            Structural Anatomy of an Agent-Native
            <br />
            Social Platform
          </h1>
          <p className="p-subtitle">
            Comparing Interaction Patterns Between AI Agent Communities
            and Human Online Forums
          </p>
          <div className="p-meta-row">
            <span className="p-meta-chip">Moltbook Observatory</span>
            <span className="p-meta-chip">2026</span>
            <span className="p-meta-chip">n = 48,733 records</span>
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
            economics. Across all dimensions, we find that agent communities are <em>structurally
            mimetic but behaviorally hollow</em> — they recreate the forms of human social interaction
            without reproducing its substance.
          </p>
          <p className="p-body">
            Three findings illustrate this pattern. First, despite having no biological need for sleep,
            agent activity follows clear circadian rhythms — revealing that agents are not autonomous
            but are operated on human schedules (Section 4). Second, agents produce text that is
            longer but less diverse than human writing, with measurably higher inter-author similarity
            consistent with LLM monoculture (Section 5). Third, the voting and karma system is
            effectively non-functional: 78% of content receives zero votes, and score inequality
            is extreme (Gini = 0.978), suggesting agents interact without meaningfully evaluating
            each other (Section 6).
          </p>

          <div className="p-callout">
            <div className="p-callout-title">Key Question</div>
            <p>
              When AI agents populate a social platform designed for human interaction, do they reproduce
              human behavioral patterns — or does something fundamentally different emerge?
            </p>
          </div>
        </section>

        {/* System Design */}
        <section className="p-section" id="system">
          <h2 className="p-section-title">2. System Design</h2>
          <p className="p-body">
            Moltbook Observatory is a modular observation and analysis pipeline built for continuous
            monitoring of agent-native social platforms. The system consists of four layers:
          </p>

          <div className="p-arch-grid">
            <div className="p-arch-card">
              <div className="p-arch-icon">1</div>
              <h4>Observation Layer</h4>
              <p>
                Platform-specific adapters fetch raw data via API (Moltbook live) or archive
                (HuggingFace). Cursor-based pagination handles large datasets. Each observation
                produces a timestamped snapshot.
              </p>
            </div>
            <div className="p-arch-card">
              <div className="p-arch-icon">2</div>
              <h4>Normalization Layer</h4>
              <p>
                Raw platform data is mapped to a canonical 13-column schema: platform, thread_id,
                post_id, parent_id, author_id, timestamp, content, subcommunity, and metadata.
                This enables cross-platform comparison.
              </p>
            </div>
            <div className="p-arch-card">
              <div className="p-arch-icon">3</div>
              <h4>Reconstruction Layer</h4>
              <p>
                Parent-child relationships are resolved into thread forests (NetworkX DiGraphs).
                Each thread tree preserves reply hierarchy. Orphan edges and cycles are detected
                and reported.
              </p>
            </div>
            <div className="p-arch-card">
              <div className="p-arch-icon">4</div>
              <h4>Analysis Layer</h4>
              <p>
                Three analysis modules compute per-thread geometry (depth, width, branching,
                archetype classification), temporal dynamics (latency distributions, burstiness),
                and network structure (degree distribution, Gini, centralization, reciprocity).
              </p>
            </div>
          </div>

          <p className="p-body">
            The backend uses Supabase (PostgreSQL) for persistent storage with automated daily
            observation via pg_cron. A Next.js dashboard provides real-time visualization,
            a live feed from the Moltbook API, and interactive browsing of archived records and
            thread structures.
          </p>
        </section>

        {/* Methodology */}
        <section className="p-section" id="methodology">
          <h2 className="p-section-title">3. Methodology</h2>

          <h3 className="p-subsection-title">3.1 Datasets</h3>
          <div className="p-dataset-cards">
            <div className="p-dataset-card moltbook">
              <h4>Moltbook</h4>
              <div className="p-dataset-stats">
                <div className="p-ds-stat">
                  <span className="p-ds-val"><AnimatedNum value={27056} /></span>
                  <span className="p-ds-label">Records</span>
                </div>
                <div className="p-ds-stat">
                  <span className="p-ds-val"><AnimatedNum value={12669} /></span>
                  <span className="p-ds-label">Threads</span>
                </div>
                <div className="p-ds-stat">
                  <span className="p-ds-val"><AnimatedNum value={1957} /></span>
                  <span className="p-ds-label">Authors</span>
                </div>
              </div>
              <p className="p-ds-desc">
                Combined dataset: HuggingFace archive (26,251 records) + live API snapshot
                (805 records). Primarily AI agents with task-specific behavioral profiles.
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
                  <span className="p-ds-val"><AnimatedNum value={500} /></span>
                  <span className="p-ds-label">Threads</span>
                </div>
                <div className="p-ds-stat">
                  <span className="p-ds-val"><AnimatedNum value={3348} /></span>
                  <span className="p-ds-label">Authors</span>
                </div>
              </div>
              <p className="p-ds-desc">
                ConvoKit corpus from a structured human deliberation subreddit with
                delta-awarding mechanics encouraging deep engagement.
              </p>
              <span className="p-ds-source">Source: ConvoKit / Cornell NLP</span>
            </div>
          </div>

          <h3 className="p-subsection-title">3.2 Thread Geometry</h3>
          <p className="p-body">
            We reconstruct reply trees from parent_id fields and compute per-thread metrics: depth
            (longest root-to-leaf path), width (maximum nodes at any level), branching factor (mean
            children per non-leaf node), leaf ratio (fraction of terminal nodes), and root reply
            share (fraction of replies directed at the root post). Threads are classified into
            three archetypes: <em>chains</em> (linear, depth ≥ width), <em>stars</em> (flat,
            branching ≤ 1, depth ≤ 2), and <em>trees</em> (branching &gt; 1 and depth &gt; 2).
          </p>

          <h3 className="p-subsection-title">3.3 Temporal Analysis</h3>
          <p className="p-body">
            Reply latency is computed as the time difference between each reply and its parent post.
            We report distributional statistics (mean, median, P95, standard deviation) and the
            burstiness coefficient B = (σ − μ) / (σ + μ), where B → 1 indicates bursty dynamics
            and B → 0 indicates Poisson-like regularity. Thread lifetime is defined as the time
            span between the first and last post in each thread.
          </p>

          <h3 className="p-subsection-title">3.4 Network Analysis</h3>
          <p className="p-body">
            We construct directed interaction graphs where an edge A → B exists if A replies to B's
            content. We compute degree distribution, Gini coefficient (inequality of participation),
            Freeman centralization (in-degree and out-degree), network density, and reciprocity
            (fraction of mutual reply pairs).
          </p>
        </section>

        {/* Results overview */}
        <section className="p-section" id="results">
          <h2 className="p-section-title">4. Results</h2>
          <p className="p-body">
            We organize our findings around six hypotheses about structural differences between
            agent and human communities. The radar chart below provides a normalized overview,
            followed by a complete metric comparison table. Detailed analysis for each hypothesis
            follows.
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

          {/* Verdict summary */}
          <div className="p-verdict-grid">
            {HYPOTHESES.map((h) => (
              <div key={h.id} className="p-verdict-card">
                <span className={`p-verdict-dot ${h.verdict}`} />
                <span className="p-verdict-tag">{h.tag}</span>
                <span className="p-verdict-text">{h.title}</span>
                <span className={`p-verdict-badge ${h.verdict}`}>
                  {h.verdict === "supported" ? "Supported" : "Partial"}
                </span>
              </div>
            ))}
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

        {/* Individual hypotheses */}
        {HYPOTHESES.map((h) => (
          <HypothesisSection key={h.id} h={h} />
        ))}

        {/* Limitations */}
        <section className="p-section" id="limitations">
          <h2 className="p-section-title">5. Limitations</h2>
          <div className="p-limitations-grid">
            {[
              {
                title: "Single Platform Comparison",
                body: "We compare one agent platform against one human subreddit. Generalization to other communities requires broader sampling across platforms and topic domains.",
              },
              {
                title: "Baseline Selection",
                body: "Reddit CMV is a deliberation-focused forum with explicit rules encouraging deep engagement, making it an upper bound on human conversational depth rather than a representative baseline.",
              },
              {
                title: "Observation Window",
                body: "The Moltbook dataset is drawn from a relatively short observation window, which may truncate thread lifetimes and underrepresent late-arriving patterns.",
              },
              {
                title: "Agent Heterogeneity",
                body: "We do not account for agent diversity—some agents may be capable of deep engagement but are underrepresented in aggregate statistics. Per-agent-type analysis could reveal subpopulations with human-like patterns.",
              },
              {
                title: "Scale Differences",
                body: "Platform age and scale differ substantially (805 vs. 21,677 records). Some structural differences may reflect maturity rather than fundamental behavioral divergence.",
              },
              {
                title: "Semantic Analysis",
                body: "This study focuses on structural and temporal metrics. Semantic analysis of content quality, topical diversity, and argumentation coherence remains future work.",
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
          <h2 className="p-section-title">6. Conclusion</h2>
          <p className="p-body">
            Across six hypotheses, the empirical evidence supports a consistent characterization of
            agent-native communities as <strong>structurally flat</strong>, <strong>temporally
            ephemeral</strong>, and <strong>socially disconnected</strong> relative to human
            communities. Agent interactions follow a broadcast-and-respond pattern with minimal
            multi-turn engagement, near-constant response timing, and predominantly unidirectional
            social ties.
          </p>
          <p className="p-body">
            These patterns are not deficiencies per se—they reflect the design objectives of current
            agent systems, which prioritize information processing and content generation over social
            engagement. However, they suggest clear boundaries on what agent-native communities can
            achieve without architectural innovations in three areas:
          </p>
          <div className="p-conclusion-pillars">
            <div className="p-pillar">
              <div className="p-pillar-icon">1</div>
              <h4>Conversational Persistence</h4>
              <p>Agents need mechanisms to maintain state across conversation turns and revisit past threads.</p>
            </div>
            <div className="p-pillar">
              <div className="p-pillar-icon">2</div>
              <h4>Relational Memory</h4>
              <p>Tracking past interlocutors and social context could enable reciprocal and dyadic exchanges.</p>
            </div>
            <div className="p-pillar">
              <div className="p-pillar-icon">3</div>
              <h4>Incentive Design</h4>
              <p>Explicit signals rewarding depth, engagement, and follow-up could shape agent behavior toward richer discourse.</p>
            </div>
          </div>
          <p className="p-body">
            As AI agents become increasingly prevalent in online social environments, understanding
            the structural fingerprints of agent-driven discourse will be essential for platform
            governance, community design, and the development of agents capable of genuine social
            participation.
          </p>
        </section>

        {/* Footer */}
        <footer className="p-footer">
          <p>Moltbook Observatory &middot; 2026</p>
          <p className="p-footer-sub">
            Built with Next.js, Supabase, NetworkX, and matplotlib.
            Data from Moltbook API and ConvoKit.
          </p>
        </footer>
      </main>
    </div>
  );
}
