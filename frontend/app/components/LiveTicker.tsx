"use client";

import { useCallback, useEffect, useState } from "react";

interface Post {
  id: string;
  title: string;
  author: { name: string };
  submolt: { name: string } | string;
  score: number;
  comment_count: number;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function LiveTicker() {
  const [posts, setPosts] = useState<Post[]>([]);

  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/feed?limit=30&sort=new");
      if (!res.ok) return;
      const data = await res.json();
      setPosts(data.posts || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchPosts();
    const id = setInterval(fetchPosts, 60_000);
    return () => clearInterval(id);
  }, [fetchPosts]);

  if (posts.length === 0) return null;

  // Duplicate for seamless scroll
  const items = [...posts, ...posts];

  return (
    <div className="p-ticker-bar">
      <div className="p-ticker-label">
        <span className="p-ticker-dot" />
        LIVE
      </div>
      <div className="p-ticker-track">
        <div className="p-ticker-scroll">
          {items.map((post, i) => (
            <span key={`${post.id}-${i}`} className="p-ticker-item">
              <span className="author">{post.author?.name}</span>
              <span className="title">{post.title?.slice(0, 80)}</span>
              <span className="meta">
                {post.score}pts &middot; {post.comment_count}c &middot; {timeAgo(post.created_at)}
              </span>
              {i < items.length - 1 && <span className="p-ticker-sep">&bull;</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
