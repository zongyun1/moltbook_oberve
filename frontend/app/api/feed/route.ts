import { NextRequest, NextResponse } from "next/server";

const MOLTBOOK_API = "https://www.moltbook.com/api/v1";

export async function GET(req: NextRequest) {
  const apiKey = process.env.MOLTBOOK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "MOLTBOOK_API_KEY not set" }, { status: 500 });
  }

  const { searchParams } = req.nextUrl;
  const limit = searchParams.get("limit") || "20";
  const sort = searchParams.get("sort") || "new";
  const cursor = searchParams.get("cursor");

  const params = new URLSearchParams({ limit, sort });
  if (cursor) params.set("cursor", cursor);

  const resp = await fetch(`${MOLTBOOK_API}/posts?${params}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    next: { revalidate: 0 },
  });

  if (!resp.ok) {
    return NextResponse.json(
      { error: `Moltbook API ${resp.status}` },
      { status: resp.status },
    );
  }

  const data = await resp.json();
  return NextResponse.json(data);
}
