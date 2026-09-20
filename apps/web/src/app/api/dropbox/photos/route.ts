import { NextResponse } from "next/server";
import type { DomainId } from "@/core/types";
import { getDropbox } from "@/lib/dropbox/client";
import { listPhotoFolders, type InventoryClient } from "@/lib/dropbox/inventory";

export const runtime = "nodejs";

const domains = ["lego", "breadboard", "fabric"] as const;

export async function GET(req: Request) {
  const client = await getDropbox();
  if (!client) return NextResponse.json({ error: "Dropbox is not connected" }, { status: 503 });
  const domain = new URL(req.url).searchParams.get("domain") as DomainId;
  if (!domains.includes(domain)) return NextResponse.json({ error: "bad domain" }, { status: 400 });
  try {
    return NextResponse.json({ folders: await listPhotoFolders(client as unknown as InventoryClient, domain) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
