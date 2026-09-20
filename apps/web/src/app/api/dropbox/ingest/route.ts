import { NextResponse } from "next/server";
import { getDropbox } from "@/lib/dropbox/client";
import { ingestPdf, loadDraft } from "@/lib/dropbox/ingest";
import type { DomainId } from "@/core/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!url.searchParams.get("domain") || !url.searchParams.get("id")) return NextResponse.json({ error: "domain and id are required" }, { status: 400 });
  try {
    return NextResponse.json(await loadDraft(url.searchParams.get("domain") as DomainId, url.searchParams.get("id")!));
  } catch {
    return NextResponse.json({ error: "Draft not found. Sync the PDF and ingest it first." }, { status: 404 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as { domain?: DomainId; id?: string };
  if (!body.domain || !body.id) return NextResponse.json({ error: "domain and id are required" }, { status: 400 });
  const client = await getDropbox();
  if (!client) return NextResponse.json({ error: "Dropbox is not connected." }, { status: 503 });
  try {
    return NextResponse.json(await ingestPdf(client, body.domain, body.id));
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json({ error: message.includes("ENOENT") ? "PDF not found. Sync the manual first." : message }, { status: 500 });
  }
}
