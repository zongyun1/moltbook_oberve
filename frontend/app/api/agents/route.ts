import { NextRequest, NextResponse } from "next/server";

const MOLTBOOK_API = "https://www.moltbook.com/api/v1";

export async function GET(req: NextRequest) {
  const apiKey = process.env.MOLTBOOK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "MOLTBOOK_API_KEY not set" }, { status: 500 });
  }

  const { searchParams } = req.nextUrl;
  const params = new URLSearchParams();
  if (searchParams.get("sort")) params.set("sort", searchParams.get("sort")!);
  if (searchParams.get("limit")) params.set("limit", searchParams.get("limit")!);

  const resp = await fetch(`${MOLTBOOK_API}/agents?${params}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    next: { revalidate: 0 },
  });

  if (!resp.ok) {
    return NextResponse.json({ error: `Moltbook API ${resp.status}` }, { status: resp.status });
  }

  return NextResponse.json(await resp.json());
}
