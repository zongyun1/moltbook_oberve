import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = getSupabase();
  const { data: records, error } = await supabase
    .from("records")
    .select("post_id, thread_id, parent_id, author_id, content, subcommunity, score, ts, meta")
    .eq("thread_id", id)
    .order("ts", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!records || records.length === 0) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const { data: geo } = await supabase
    .from("thread_geometry")
    .select("archetype, depth, width, size, mean_branching, leaf_ratio, root_reply_share, lifetime_s")
    .eq("thread_id", id)
    .limit(1)
    .single();

  const root = records.find((r: any) => !r.parent_id || r.post_id === r.thread_id);
  const comments = records.filter((r: any) => r.post_id !== root?.post_id);

  return NextResponse.json({
    thread_id: id,
    root,
    comments,
    geometry: geo || null,
    total: records.length,
  });
}
