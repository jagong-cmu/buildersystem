import { NextResponse } from "next/server";
import type { DomainId } from "@/core/types";
import { getDropbox } from "@/lib/dropbox/client";
import { scanPhotoFolder, type InventoryClient } from "@/lib/dropbox/inventory";

export const runtime = "nodejs";

const domains = ["lego", "breadboard", "fabric"] as const;
const modes = ["same-pile", "different-bins"] as const;

export async function POST(req: Request) {
  const client = await getDropbox();
  if (!client) return NextResponse.json({ error: "Dropbox is not connected" }, { status: 503 });
  try {
    const body = (await req.json()) as { domain?: DomainId; folder?: string; mode?: "same-pile" | "different-bins" };
    if (!domains.includes(body.domain as DomainId)) return NextResponse.json({ error: "bad domain" }, { status: 400 });
    if (!body.folder || !modes.includes(body.mode as (typeof modes)[number])) return NextResponse.json({ error: "bad folder or mode" }, { status: 400 });
    return NextResponse.json(await scanPhotoFolder(client as unknown as InventoryClient, body.domain!, body.folder, body.mode!));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
