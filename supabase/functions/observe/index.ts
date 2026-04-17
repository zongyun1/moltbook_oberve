/**
 * Supabase Edge Function: /observe
 *
 * Fetches real-time data from the Moltbook API (moltbook.com/api/v1),
 * normalizes it, and inserts into Supabase Postgres.
 *
 * Triggered by pg_cron (daily) or manual POST.
 *
 * Environment variables (set in Supabase Dashboard → Edge Functions → Secrets):
 *   MOLTBOOK_API_KEY   — your moltbook_sk_... key
 *
 * Deploy: supabase functions deploy observe --no-verify-jwt
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MOLTBOOK_API = "https://www.moltbook.com/api/v1";

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const moltbookKey = Deno.env.get("MOLTBOOK_API_KEY");
    if (!moltbookKey) {
      return jsonResp({ status: "error", message: "MOLTBOOK_API_KEY not set" }, 500);
    }

    // Parse optional config from request
    const url = new URL(req.url);
    const maxPosts = parseInt(url.searchParams.get("max_posts") || "200");
    const sort = url.searchParams.get("sort") || "new";
    const fetchComments = url.searchParams.get("comments") !== "false";

    // --- 1. Create snapshot record ---
    const { data: snapshot, error: snapErr } = await supabase
      .from("snapshots")
      .insert({
        platform: "moltbook",
        dump_date: new Date().toISOString().slice(0, 10),
        status: "pending",
        meta: { source: "live_api", sort, max_posts: maxPosts },
      })
      .select()
      .single();

    if (snapErr) throw new Error(`Snapshot insert: ${snapErr.message}`);
    const snapshotId = snapshot.id;
    console.log(`Snapshot ${snapshotId} created`);

    // --- 2. Fetch posts from Moltbook API ---
    const posts = await fetchPosts(moltbookKey, sort, maxPosts);
    console.log(`Fetched ${posts.length} posts`);

    // --- 3. Fetch comments for each post ---
    let allComments: MoltbookComment[] = [];
    if (fetchComments) {
      for (const post of posts) {
        if (post.comment_count > 0) {
          const comments = await fetchPostComments(moltbookKey, post.id);
          allComments.push(...comments);
        }
      }
      console.log(`Fetched ${allComments.length} comments`);
    }

    // --- 4. Normalize and insert posts ---
    let insertedCount = 0;

    const postRecords = posts.map((p) => ({
      snapshot_id: snapshotId,
      platform: "moltbook",
      thread_id: p.id,
      post_id: p.id,
      parent_id: null,
      author_id: p.author?.name || p.author_id,
      ts: p.created_at,
      content: `${p.title || ""}\n${p.content || ""}`.trim(),
      subcommunity: typeof p.submolt === "object" ? p.submolt?.name : p.submolt,
      score: p.score || 0,
      meta: {
        upvotes: p.upvotes,
        downvotes: p.downvotes,
        comment_count: p.comment_count,
        author_karma: p.author?.karma,
        author_followers: p.author?.followerCount,
        verification_status: p.verification_status,
      },
    }));

    for (let i = 0; i < postRecords.length; i += 500) {
      const batch = postRecords.slice(i, i + 500);
      const { error } = await supabase.from("records").upsert(batch, {
        onConflict: "snapshot_id,post_id",
        ignoreDuplicates: true,
      });
      if (error) console.error(`Post batch error: ${error.message}`);
      else insertedCount += batch.length;
    }

    // --- 5. Normalize and insert comments ---
    const commentRecords = allComments.map((c) => ({
      snapshot_id: snapshotId,
      platform: "moltbook",
      thread_id: c._post_id,
      post_id: c.id,
      parent_id: c.parent_id || c._post_id,
      author_id: c.author?.name || c.author_id,
      ts: c.created_at,
      content: c.content || "",
      subcommunity: null,
      score: c.score || 0,
      meta: {
        depth: c.depth,
        reply_count: c.reply_count,
        is_spam: c.is_spam,
        author_karma: c.author?.karma,
      },
    }));

    for (let i = 0; i < commentRecords.length; i += 500) {
      const batch = commentRecords.slice(i, i + 500);
      const { error } = await supabase.from("records").upsert(batch, {
        onConflict: "snapshot_id,post_id",
        ignoreDuplicates: true,
      });
      if (error) console.error(`Comment batch error: ${error.message}`);
      else insertedCount += batch.length;
    }

    // --- 6. Update snapshot ---
    await supabase
      .from("snapshots")
      .update({
        status: "complete",
        post_count: posts.length,
        comment_count: allComments.length,
        meta: {
          source: "live_api",
          sort,
          max_posts: maxPosts,
          latest_post_time: posts[0]?.created_at,
        },
      })
      .eq("id", snapshotId);

    return jsonResp({
      status: "complete",
      snapshot_id: snapshotId,
      posts: posts.length,
      comments: allComments.length,
      records_inserted: insertedCount,
    });
  } catch (err) {
    console.error("Observation failed:", err);
    return jsonResp({ status: "error", message: (err as Error).message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Moltbook API helpers
// ---------------------------------------------------------------------------

interface MoltbookPost {
  id: string;
  title: string;
  content: string;
  author_id: string;
  author: { name: string; karma: number; followerCount: number };
  submolt: { name: string } | string;
  upvotes: number;
  downvotes: number;
  score: number;
  comment_count: number;
  verification_status: string;
  created_at: string;
  [key: string]: unknown;
}

interface MoltbookComment {
  id: string;
  post_id: string;
  parent_id: string | null;
  content: string;
  author_id: string;
  author: { name: string; karma: number };
  depth: number;
  score: number;
  reply_count: number;
  is_spam: boolean;
  created_at: string;
  replies?: MoltbookComment[];
  _post_id: string;
  [key: string]: unknown;
}

async function fetchPosts(
  apiKey: string,
  sort: string,
  maxPosts: number,
): Promise<MoltbookPost[]> {
  const all: MoltbookPost[] = [];
  let cursor: string | null = null;

  while (all.length < maxPosts) {
    const limit = Math.min(50, maxPosts - all.length);
    const params = new URLSearchParams({ sort, limit: String(limit) });
    if (cursor) params.set("cursor", cursor);

    const resp = await fetch(`${MOLTBOOK_API}/posts?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!resp.ok) {
      console.error(`Posts API ${resp.status}: ${await resp.text()}`);
      break;
    }

    const data = await resp.json();
    const posts: MoltbookPost[] = data.posts || [];
    all.push(...posts);

    cursor = data.next_cursor;
    if (!data.has_more || !cursor) break;
  }

  return all;
}

async function fetchPostComments(
  apiKey: string,
  postId: string,
): Promise<MoltbookComment[]> {
  const resp = await fetch(
    `${MOLTBOOK_API}/posts/${postId}/comments?sort=top&limit=50`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );

  if (!resp.ok) return [];

  const data = await resp.json();
  const flat: MoltbookComment[] = [];
  flattenComments(data.comments || [], postId, flat);
  return flat;
}

function flattenComments(
  comments: MoltbookComment[],
  postId: string,
  out: MoltbookComment[],
) {
  for (const c of comments) {
    c._post_id = postId;
    if (!c.parent_id && c.depth === 0) {
      c.parent_id = postId;
    }
    const replies = c.replies || [];
    delete c.replies;
    out.push(c);
    if (replies.length > 0) {
      flattenComments(replies, postId, out);
    }
  }
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
