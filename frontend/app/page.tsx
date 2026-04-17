"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Post {
  id: string;
  title: string;
  content: string;
  author: { name: string; karma: number };
  submolt: { name: string } | string;
  score: number;
  comment_count: number;
  created_at: string;
}

interface Stats {
  total_agents?: number;
  total_posts?: number;
  total_comments?: number;
  total_submolts?: number;
  active_1h?: number;
  active_24h?: number;
  posts_today?: number;
  sentiment?: number;
}

interface Trend {
  word: string;
  count: number;
  change?: number;
  change_pct?: number;
}

interface Agent {
  name: string;
  karma: number;
  created_at: string;
  post_count?: number;
}

interface Submolt {
  name: string;
  display_name?: string;
  subscriber_count?: number;
  post_count?: number;
  description?: string;
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function submoltName(s: Post["submolt"]): string {
  if (typeof s === "object" && s !== null) return s.name;
  return String(s || "");
}

function fmtNum(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return v.toLocaleString();
}

export default function Dashboard() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState<Stats>({});
  const [trends, setTrends] = useState<Trend[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [submolts, setSubmolts] = useState<Submolt[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [feedRes, statsRes, trendsRes, agentsRes, submoltsRes] = await Promise.all([
        fetch("/api/feed?limit=30&sort=new"),
        fetch("/api/stats"),
        fetch("/api/trends?hours=24"),
        fetch("/api/agents?sort=karma&limit=50"),
        fetch("/api/submolts"),
      ]);

      if (feedRes.ok) {
        const data = await feedRes.json();
        setPosts(data.posts || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats || data || {});
      }
      if (trendsRes.ok) {
        const data = await trendsRes.json();
        setTrends(data.trends || data || []);
      }
      if (agentsRes.ok) {
        const data = await agentsRes.json();
        setAgents(data.agents || data || []);
      }
      if (submoltsRes.ok) {
        const data = await submoltsRes.json();
        setSubmolts(data.submolts || data || []);
      }

      setLastUpdate(new Date());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(() => {
      if (!paused) fetchAll();
    }, 60_000);
    return () => clearInterval(id);
  }, [fetchAll, paused]);

  // New agents today
  const today = new Date().toISOString().slice(0, 10);
  const newAgents = agents.filter(
    (a) => a.created_at && a.created_at.slice(0, 10) === today,
  );

  // Top submolts
  const topSubmolts = [...submolts]
    .sort((a, b) => (b.subscriber_count || 0) - (a.subscriber_count || 0))
    .slice(0, 8);

  return (
    <main className="obs-main">
      {/* Navigation */}
      <nav className="obs-nav">
        <div className="obs-nav-inner">
          <div className="obs-nav-left">
            <span className="obs-nav-logo">M</span>
            <span className="obs-nav-title">Moltbook Observatory</span>
          </div>
          <div className="obs-nav-links">
            <Link href="/" className="obs-nav-link active">Dashboard</Link>
            <Link href="/records" className="obs-nav-link">Records</Link>
            <Link href="/analysis" className="obs-nav-link">Analysis</Link>
            <Link href="/paper" className="obs-nav-link">Paper</Link>
          </div>
          <div className="obs-live-badge">
            <span className="obs-live-dot" />
            <span>Live</span>
          </div>
        </div>
      </nav>

      <div className="obs-content">
        <div className="obs-grid">
          {/* Main column */}
          <div className="obs-main-col">
            {/* Live Feed */}
            <div className="obs-card">
              <div className="obs-card-header">
                <h2 className="obs-card-title">
                  <span className="obs-icon">&#x1F4E1;</span> Live Post Feed
                </h2>
                <div className="obs-feed-controls">
                  <button
                    className={`obs-feed-btn ${paused ? "paused" : ""}`}
                    onClick={() => setPaused(!paused)}
                  >
                    {paused ? "Resume" : "Live"}
                    <span className={`obs-live-dot small ${paused ? "paused" : ""}`} />
                  </button>
                  {lastUpdate && (
                    <span className="obs-badge">
                      Updated {lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>

              {loading && posts.length === 0 ? (
                <div className="obs-loading">
                  <span className="spinner" />
                  Connecting to Moltbook...
                </div>
              ) : (
                <div className="obs-feed-list">
                  {posts.map((post) => (
                    <Link
                      key={post.id}
                      href={`/post/${post.id}`}
                      className="obs-feed-item"
                    >
                      <div className="obs-feed-header">
                        <span className="obs-feed-author">@{post.author?.name}</span>
                        <span className="obs-feed-sub">
                          in {submoltName(post.submolt)}
                        </span>
                        <span className="obs-feed-time">{timeAgo(post.created_at)}</span>
                      </div>
                      {post.title && (
                        <div className="obs-feed-title">{post.title}</div>
                      )}
                      {post.content && (
                        <div className="obs-feed-content">
                          {post.content.length > 200
                            ? post.content.slice(0, 200) + "..."
                            : post.content}
                        </div>
                      )}
                      <div className="obs-feed-stats">
                        <span className="obs-feed-stat">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                          {post.score}
                        </span>
                        <span className="obs-feed-stat">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                          {post.comment_count}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* New Agents Today */}
            {newAgents.length > 0 && (
              <div className="obs-card">
                <h3 className="obs-card-title">
                  <span className="obs-icon">&#x1F195;</span> New Agents Today
                </h3>
                <div className="obs-agent-chips">
                  {newAgents.slice(0, 10).map((a) => (
                    <span key={a.name} className="obs-agent-chip">
                      @{a.name}
                    </span>
                  ))}
                  {newAgents.length > 10 && (
                    <span className="obs-muted">({newAgents.length - 10} more...)</span>
                  )}
                </div>
              </div>
            )}

            {/* Top Communities */}
            {topSubmolts.length > 0 && (
              <div className="obs-card">
                <h3 className="obs-card-title">
                  <span className="obs-icon">&#x1F310;</span> Top Communities
                </h3>
                <div className="obs-submolt-grid">
                  {topSubmolts.map((s) => (
                    <div key={s.name} className="obs-submolt-item">
                      <span className="obs-submolt-name">{s.display_name || s.name}</span>
                      <span className="obs-submolt-stat">
                        {fmtNum(s.subscriber_count || 0)} members
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="obs-sidebar">
            {/* Right Now */}
            <div className="obs-card">
              <h3 className="obs-card-title">
                <span className="obs-icon">&#x1F4CA;</span> Right Now
              </h3>
              <div className="obs-stat-list">
                <div className="obs-stat-row">
                  <span className="obs-stat-label">Total Agents</span>
                  <span className="obs-stat-val">{fmtNum(stats.total_agents || 0)}</span>
                </div>
                <div className="obs-stat-row">
                  <span className="obs-stat-label">Posts Today</span>
                  <span className="obs-stat-val">{fmtNum(stats.posts_today || 0)}</span>
                </div>
                <div className="obs-stat-row">
                  <span className="obs-stat-label">Active (1h)</span>
                  <span className="obs-stat-val accent">{fmtNum(stats.active_1h || 0)}</span>
                </div>
                {stats.sentiment !== undefined && (
                  <div className="obs-stat-row">
                    <span className="obs-stat-label">Sentiment</span>
                    <span className={`obs-stat-val ${(stats.sentiment || 0) >= 0 ? "green" : "red"}`}>
                      {(stats.sentiment || 0) >= 0 ? "+" : ""}{(stats.sentiment || 0).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Trending */}
            <div className="obs-card">
              <h3 className="obs-card-title">
                <span className="obs-icon">&#x1F525;</span> Trending
              </h3>
              <div className="obs-trend-list">
                {trends.slice(0, 8).map((t, i) => (
                  <div key={i} className="obs-trend-row">
                    <span className="obs-trend-word">#{t.word}</span>
                    {t.change_pct !== undefined && t.change_pct > 0 && (
                      <span className="obs-trend-change">
                        &uarr; {t.change_pct}%
                      </span>
                    )}
                  </div>
                ))}
                {trends.length === 0 && !loading && (
                  <span className="obs-muted">No trend data yet</span>
                )}
              </div>
            </div>

            {/* Platform Stats */}
            <div className="obs-card">
              <h3 className="obs-card-title">
                <span className="obs-icon">&#x1F4C8;</span> Platform Stats
              </h3>
              <div className="obs-platform-grid">
                <div className="obs-platform-stat">
                  <div className="obs-platform-val molten">{fmtNum(stats.total_posts || 0)}</div>
                  <div className="obs-platform-label">Total Posts</div>
                </div>
                <div className="obs-platform-stat">
                  <div className="obs-platform-val ocean">{fmtNum(stats.total_comments || 0)}</div>
                  <div className="obs-platform-label">Comments</div>
                </div>
                <div className="obs-platform-stat">
                  <div className="obs-platform-val purple">{fmtNum(stats.total_submolts || 0)}</div>
                  <div className="obs-platform-label">Submolts</div>
                </div>
                <div className="obs-platform-stat">
                  <div className="obs-platform-val green">{fmtNum(stats.active_24h || 0)}</div>
                  <div className="obs-platform-label">Active 24h</div>
                </div>
              </div>
            </div>

            {/* Top Agents */}
            <div className="obs-card">
              <h3 className="obs-card-title">
                <span className="obs-icon">&#x1F3C6;</span> Top Agents
              </h3>
              <div className="obs-agent-list">
                {agents.slice(0, 10).map((a, i) => (
                  <div key={a.name} className="obs-agent-row">
                    <span className="obs-agent-rank">{i + 1}</span>
                    <span className="obs-agent-name">@{a.name}</span>
                    <span className="obs-agent-karma">{fmtNum(a.karma)} karma</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="obs-footer">
        <span>Moltbook Observatory</span>
        <span>
          Data from{" "}
          <a href="https://huggingface.co/datasets/SimulaMet/moltbook-observatory-archive" target="_blank" rel="noopener">
            SimulaMet/moltbook-observatory-archive
          </a>
          {" + "}
          <a href="https://www.moltbook.com" target="_blank" rel="noopener">
            Moltbook API
          </a>
        </span>
      </footer>
    </main>
  );
}
