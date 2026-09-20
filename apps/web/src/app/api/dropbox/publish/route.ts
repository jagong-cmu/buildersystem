import { NextResponse } from "next/server";
import { getDropbox } from "@/lib/dropbox/client";
import { publishDraft } from "@/lib/dropbox/ingest";
import type { DomainId } from "@/core/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { domain?: DomainId; id?: string; draft?: unknown };
  if (!body.domain || !body.id || !body.draft) return NextResponse.json({ error: "domain, id, and draft are required" }, { status: 400 });
  const client = await getDropbox();
  if (!client) return NextResponse.json({ error: "Dropbox is not connected." }, { status: 503 });
  try {
    return NextResponse.json({ id: await publishDraft(client, body.domain, body.id, body.draft) });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
