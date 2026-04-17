"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface PostRecord {
  post_id: string;
  thread_id: string;
  parent_id: string | null;
  author_id: string;
  content: string;
  subcommunity: string | null;
  score: number;
  ts: string;
  comment_count: number;
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function RecordsPage() {
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (search) params.set("q", search);
      const res = await fetch(`/api/records?${params}`);
      const data = await res.json();
      setPosts(data.posts || []);
      setTotalPages(data.pages || 1);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  return (
    <main className="dashboard">
      <header className="header">
        <div className="header-left">
          <Link href="/" className="logo">M</Link>
          <h1>
            Moltbook <span>Records</span>
          </h1>
        </div>
        <span className="card-badge">{total.toLocaleString()} threads (HuggingFace archive)</span>
      </header>

      <form className="records-search" onSubmit={handleSearch}>
        <input
          type="text"
          className="records-search-input"
          placeholder="Search posts..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <button type="submit" className="records-search-btn">Search</button>
        {search && (
          <button
            type="button"
            className="records-search-btn records-search-clear"
            onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}
          >
            Clear
          </button>
        )}
      </form>

      {loading ? (
        <div className="feed-loading">
          <span className="spinner" />
          Loading records...
        </div>
      ) : (
        <>
          <div className="feed-list">
            {posts.map((post) => (
              <Link
                key={post.post_id}
                href={`/records/thread/${post.thread_id}`}
                className="feed-item"
                style={{ textDecoration: "none", color: "inherit", display: "block" }}
              >
                <div className="feed-item-header">
                  <span className="feed-author">{post.author_id}</span>
                  {post.subcommunity && (
                    <span className="feed-meta">
                      in <span className="feed-submolt">{post.subcommunity}</span>
                    </span>
                  )}
                  <span className="feed-time">{timeAgo(post.ts)}</span>
                </div>
                <div className="feed-content" style={{ marginBottom: "0.5rem" }}>
                  {post.content && post.content.length > 280
                    ? post.content.slice(0, 280) + "..."
                    : post.content}
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
                  <span className="feed-stat">
                    {post.thread_id.slice(0, 8)}
                  </span>
                </div>
              </Link>
            ))}
          </div>

          <div className="records-pagination">
            <button
              className="records-page-btn"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Prev
            </button>
            <span className="records-page-info">
              Page {page} of {totalPages}
            </span>
            <button
              className="records-page-btn"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </main>
  );
}
