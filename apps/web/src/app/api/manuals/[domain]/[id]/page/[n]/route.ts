import { NextResponse } from "next/server";
import { getPageImage } from "@/lib/ingest/rasterize";
import type { DomainId } from "@/core/types";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ domain: string; id: string; n: string }> }) {
  const { domain, id, n } = await params;
  try {
    const image = await getPageImage(domain as DomainId, id, Number(n));
    return new NextResponse(image as BodyInit, { headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" } });
  } catch {
    return NextResponse.json({ error: "Page unavailable" }, { status: 404 });
  }
}
