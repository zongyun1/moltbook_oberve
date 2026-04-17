"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface Record {
  post_id: string;
  thread_id: string;
  parent_id: string | null;
  author_id: string;
  content: string;
  subcommunity: string | null;
  score: number;
  ts: string;
  meta: any;
}

interface Geometry {
  archetype: string;
  depth: number;
  width: number;
  size: number;
  mean_branching: number;
  leaf_ratio: number;
  root_reply_share: number;
  lifetime_s: number;
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

interface TreeNode extends Record {
  children: TreeNode[];
}

function buildTree(root: Record | null, comments: Record[]): TreeNode[] {
  const all = root ? [root, ...comments] : comments;
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const r of all) {
    map.set(r.post_id, { ...r, children: [] });
  }

  for (const r of all) {
    const node = map.get(r.post_id)!;
    if (r.parent_id && map.has(r.parent_id) && r.post_id !== r.thread_id) {
      map.get(r.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function CommentNode({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const indent = Math.min(depth, 8);
  const isRoot = !node.parent_id || node.post_id === node.thread_id;
  return (
    <>
      <div className={isRoot ? "thread-root-record" : "thread-comment"} style={!isRoot ? { marginLeft: `${indent * 1.25}rem` } : {}}>
        <div className="thread-comment-header">
          <span className="thread-comment-author">{node.author_id}</span>
          <span className="thread-comment-meta">{timeAgo(node.ts)}</span>
          <span className="thread-comment-meta">
            {new Date(node.ts).toLocaleString()}
          </span>
          <span className="thread-comment-score">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
            {node.score}
          </span>
        </div>
        <div className={isRoot ? "thread-post-content" : "thread-comment-body"}>
          {node.content}
        </div>
      </div>
      {node.children.map((child) => (
        <CommentNode key={child.post_id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const [root, setRoot] = useState<Record | null>(null);
  const [comments, setComments] = useState<Record[]>([]);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/records/thread/${id}`);
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        setRoot(data.root || null);
        setComments(data.comments || []);
        setGeometry(data.geometry || null);
        setTotal(data.total || 0);
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
          Loading thread...
        </div>
      </main>
    );
  }

  if (error || !root) {
    return (
      <main className="dashboard">
        <div className="empty-state">
          <h1>Thread not found</h1>
          <p>{error || "Could not load this thread."}</p>
          <Link href="/records" className="thread-back">Back to records</Link>
        </div>
      </main>
    );
  }

  const tree = buildTree(root, comments);

  return (
    <main className="dashboard">
      <Link href="/records" className="thread-back">Back to records</Link>

      {geometry && (
        <div className="thread-geometry-bar">
          <span className={`thread-archetype-badge ${geometry.archetype}`}>
            {geometry.archetype}
          </span>
          <span className="thread-geo-stat">depth: {geometry.depth}</span>
          <span className="thread-geo-stat">width: {geometry.width}</span>
          <span className="thread-geo-stat">size: {geometry.size}</span>
          <span className="thread-geo-stat">branching: {geometry.mean_branching.toFixed(2)}</span>
          <span className="thread-geo-stat">leaf ratio: {(geometry.leaf_ratio * 100).toFixed(1)}%</span>
          <span className="thread-geo-stat">lifetime: {fmtDuration(geometry.lifetime_s)}</span>
        </div>
      )}

      <div className="thread-comments-section">
        <div className="card-header">
          <div className="card-title">
            Thread
            <span className="card-badge">{total} posts</span>
          </div>
          <span className="card-badge">{id.slice(0, 8)}</span>
        </div>
        <div className="thread-comments-list">
          {tree.map((node) => (
            <CommentNode key={node.post_id} node={node} />
          ))}
        </div>
      </div>
    </main>
  );
}
