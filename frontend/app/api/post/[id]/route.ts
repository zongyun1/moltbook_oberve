import { NextRequest, NextResponse } from "next/server";

const MOLTBOOK_API = "https://www.moltbook.com/api/v1";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const apiKey = process.env.MOLTBOOK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "MOLTBOOK_API_KEY not set" }, { status: 500 });
  }

  const { id } = await params;

  const [postRes, commentsRes] = await Promise.all([
    fetch(`${MOLTBOOK_API}/posts/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 0 },
    }),
    fetch(`${MOLTBOOK_API}/posts/${id}/comments`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 0 },
    }),
  ]);

  if (!postRes.ok) {
    return NextResponse.json(
      { error: `Moltbook API ${postRes.status}` },
      { status: postRes.status },
    );
  }

  const post = await postRes.json();
  const comments = commentsRes.ok ? await commentsRes.json() : { comments: [] };

  return NextResponse.json({ post, comments: comments.comments || comments || [] });
}
