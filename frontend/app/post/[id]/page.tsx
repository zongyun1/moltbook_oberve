"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface Author {
  name: string;
  karma: number;
  followerCount: number;
}

interface Comment {
  id: string;
  content: string;
  author: Author;
  score: number;
  created_at: string;
  parent_id: string | null;
  depth?: number;
  replies?: Comment[];
}

interface Post {
  id: string;
  title: string;
  content: string;
  author: Author;
  submolt: { name: string; display_name: string } | string;
  score: number;
  comment_count: number;
  created_at: string;
  verification_status: string;
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function submoltName(s: Post["submolt"]): string {
  if (typeof s === "object" && s !== null) return s.name;
  return String(s || "");
}

function buildTree(comments: Comment[]): Comment[] {
  const map = new Map<string, Comment & { children: Comment[] }>();
  const roots: (Comment & { children: Comment[] })[] = [];

  for (const c of comments) {
    map.set(c.id, { ...c, children: [] });
  }

  for (const c of comments) {
    const node = map.get(c.id)!;
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function flattenNested(comments: Comment[]): Comment[] {
  const flat: Comment[] = [];
  function walk(list: Comment[], depth: number) {
    for (const c of list) {
      flat.push({ ...c, depth });
      if (c.replies && c.replies.length > 0) {
        walk(c.replies, depth + 1);
      }
    }
  }
  walk(comments, 0);
  return flat;
}

function CommentNode({ comment, depth = 0 }: { comment: Comment & { children?: Comment[] }; depth?: number }) {
  const indent = Math.min(depth, 8);
  return (
    <div className="thread-comment" style={{ marginLeft: `${indent * 1.25}rem` }}>
      <div className="thread-comment-header">
        <span className="thread-comment-author">{comment.author?.name || "unknown"}</span>
        <span className="thread-comment-meta">{timeAgo(comment.created_at)}</span>
        <span className="thread-comment-score">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
          {comment.score}
        </span>
      </div>
      <div className="thread-comment-body">{comment.content}</div>
      {comment.children?.map((child) => (
        <CommentNode key={child.id} comment={child as Comment & { children?: Comment[] }} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<(Comment & { children?: Comment[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/post/${id}`);
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        const p = data.post?.post || data.post;
        setPost(p);

        const rawComments: Comment[] = data.comments || [];
        if (rawComments.length > 0 && rawComments[0].replies) {
          const flat = flattenNested(rawComments);
          setComments(buildTree(flat));
        } else {
          setComments(buildTree(rawComments));
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <main className="dashboard">
        <div className="feed-loading" style={{ minHeight: "60vh" }}>
          <span className="spinner" />
          Loading post...
        </div>
      </main>
    );
  }

  if (error || !post) {
    return (
      <main className="dashboard">
        <div className="empty-state">
          <h1>Post not found</h1>
          <p>{error || "Could not load this post."}</p>
          <Link href="/" className="thread-back">Back to dashboard</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <Link href="/" className="thread-back">Back to dashboard</Link>

      <article className="thread-post">
        <div className="thread-post-header">
          <span className="feed-submolt">{submoltName(post.submolt)}</span>
          <span className="thread-post-meta">
            posted by <span className="feed-author">{post.author?.name}</span>
            {" "}{timeAgo(post.created_at)}
          </span>
        </div>
        <h1 className="thread-post-title">{post.title}</h1>
        <div className="thread-post-content">{post.content}</div>
        <div className="feed-stats" style={{ marginTop: "1rem" }}>
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
          {post.verification_status && (
            <span className="feed-stat">{post.verification_status}</span>
          )}
        </div>
      </article>

      <div className="thread-comments-section">
        <div className="card-header">
          <div className="card-title">
            Comments
            <span className="card-badge">{comments.length} top-level</span>
          </div>
        </div>
        {comments.length === 0 ? (
          <div className="thread-empty-comments">No comments yet.</div>
        ) : (
          <div className="thread-comments-list">
            {comments.map((c) => (
              <CommentNode key={c.id} comment={c} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
