import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") || "50"));
  const search = searchParams.get("q") || "";
  const offset = (page - 1) * limit;

  let query = getSupabase()
    .from("records")
    .select("post_id, thread_id, parent_id, author_id, content, subcommunity, score, ts, meta", { count: "exact" })
    .is("parent_id", null)
    .order("ts", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.ilike("content", `%${search}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const threadIds = (data || []).map((r: any) => r.thread_id);
  let commentCounts: Record<string, number> = {};

  if (threadIds.length > 0) {
    const { data: counts } = await getSupabase()
      .from("records")
      .select("thread_id")
      .in("thread_id", threadIds)
      .not("parent_id", "is", null);

    if (counts) {
      for (const c of counts) {
        commentCounts[c.thread_id] = (commentCounts[c.thread_id] || 0) + 1;
      }
    }
  }

  const posts = (data || []).map((r: any) => ({
    ...r,
    comment_count: commentCounts[r.thread_id] || 0,
  }));

  return NextResponse.json({
    posts,
    total: count || 0,
    page,
    limit,
    pages: Math.ceil((count || 0) / limit),
  });
}
