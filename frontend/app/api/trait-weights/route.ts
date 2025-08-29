import { NextResponse } from "next/server";

function normalizeBase(url: string) {
  return url.replace(/\/+$/, "");
}

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!baseUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_API_URL is not set" },
      { status: 500 }
    );
  }

  try {
    // Asumsi backend punya endpoint /api/rules yang return { weights, showTo, specific, ... }
    const res = await fetch(`${normalizeBase(baseUrl)}/api/rules`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend /api/rules failed: ${res.status} ${res.statusText}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data?.weights ?? {});
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Failed to fetch trait weights from backend",
        detail: String(err?.message ?? err),
      },
      { status: 502 }
    );
  }
}
