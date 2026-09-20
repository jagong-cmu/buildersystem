import { NextResponse } from "next/server";
import type { DomainId, Inventory } from "@/core/types";
import { getDropbox } from "@/lib/dropbox/client";
import { readInventory, toPersisted, writeInventory, type InventoryClient } from "@/lib/dropbox/inventory";

export const runtime = "nodejs";

const domains = ["lego", "breadboard", "fabric"] as const;

export async function GET(req: Request) {
  const client = await getDropbox();
  if (!client) return NextResponse.json({ error: "Dropbox is not connected" }, { status: 503 });
  const domain = new URL(req.url).searchParams.get("domain") as DomainId;
  if (!domains.includes(domain)) return NextResponse.json({ error: "bad domain" }, { status: 400 });
  try {
    const inventory = await readInventory(client as unknown as InventoryClient, domain);
    return inventory ? NextResponse.json(inventory) : NextResponse.json({ error: "Inventory not found" }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const client = await getDropbox();
  if (!client) return NextResponse.json({ error: "Dropbox is not connected" }, { status: 503 });
  try {
    const inventory = (await req.json()) as Inventory;
    if (!domains.includes(inventory.domain)) return NextResponse.json({ error: "bad domain" }, { status: 400 });
    const result = await writeInventory(client as unknown as InventoryClient, inventory.domain, toPersisted(inventory));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
