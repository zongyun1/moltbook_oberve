"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

interface Author {
  name: string;
  karma: number;
  followerCount: number;
}

interface Submolt {
  name: string;
  display_name: string;
}

interface Post {
  id: string;
  title: string;
  content: string;
  author: Author;
  submolt: Submolt | string;
  score: number;
  comment_count: number;
  created_at: string;
  verification_status: string;
}

const POLL_INTERVAL = 30_000;

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

export default function LiveFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [paused, setPaused] = useState(false);
  const knownIds = useRef(new Set<string>());
  const initialLoad = useRef(true);

  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/feed?limit=30&sort=new");
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const incoming: Post[] = data.posts || [];

      let freshCount = 0;
      for (const p of incoming) {
        if (!knownIds.current.has(p.id)) {
          freshCount++;
          knownIds.current.add(p.id);
        }
      }

      if (!initialLoad.current && freshCount > 0) {
        setNewCount((c) => c + freshCount);
      }
      initialLoad.current = false;

      setPosts(incoming);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
    const id = setInterval(() => {
      if (!paused) fetchPosts();
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchPosts, paused]);

  return (
    <div className="card live-feed-card">
      <div className="card-header">
        <div className="card-title">
          Live Feed
          {newCount > 0 && (
            <span className="new-badge" onClick={() => setNewCount(0)}>
              +{newCount} new
            </span>
          )}
        </div>
        <div className="feed-controls">
          <button
            className={`feed-btn ${paused ? "paused" : ""}`}
            onClick={() => setPaused(!paused)}
            title={paused ? "Resume polling" : "Pause polling"}
          >
            {paused ? "Resume" : "Live"}
            <span className={`dot ${paused ? "paused" : ""}`} />
          </button>
          {lastUpdate && (
            <span className="card-badge">
              {lastUpdate.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>

      {error && <div className="feed-error">API error: {error}</div>}

      {loading && posts.length === 0 ? (
        <div className="feed-loading">
          <span className="spinner" />
          Connecting to Moltbook...
        </div>
      ) : (
        <div className="feed-list">
          {posts.map((post, i) => (
            <Link
              key={post.id}
              href={`/post/${post.id}`}
              className="feed-item"
              style={{ animationDelay: `${i * 30}ms`, textDecoration: "none", color: "inherit", display: "block" }}
            >
              <div className="feed-item-header">
                <span className="feed-author">{post.author?.name}</span>
                <span className="feed-meta">
                  in <span className="feed-submolt">{submoltName(post.submolt)}</span>
                </span>
                <span className="feed-time">{timeAgo(post.created_at)}</span>
              </div>
              <div className="feed-title">{post.title}</div>
              <div className="feed-content">
                {(post.content || "").length > 200
                  ? post.content.slice(0, 200) + "..."
                  : post.content || ""}
              </div>
              <div className="feed-stats">
                <span className="feed-stat" title="Score">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                  {post.score}
                </span>
                <span className="feed-stat" title="Comments">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                  {post.comment_count}
                </span>
                {post.author?.karma > 0 && (
                  <span className="feed-stat" title="Author karma">
                    K:{post.author.karma.toLocaleString()}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
