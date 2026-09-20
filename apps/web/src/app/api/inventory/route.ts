import { NextResponse } from "next/server";
import { getPlugin } from "@/domains";
import type { DomainId } from "@/core/types";
import { inventoryPrompt, inventorySchema, makeInventory } from "@/core/inventory";
import { VISION_MOCK, imageHash, visionObject } from "@/lib/vision";
import type { DomainPlugin } from "@/core/plugin";
import type { InventoryItem } from "@/core/types";

export const runtime = "nodejs";

/** POST multipart: domain, sourceId, image (one or more) → Inventory. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const domain = String(form.get("domain") ?? "") as DomainId;
    const sourceId = String(form.get("sourceId") ?? "upload");
    const files = form.getAll("image").filter((f): f is File => f instanceof File);
    if (!["lego", "breadboard", "fabric"].includes(domain)) return NextResponse.json({ error: "bad domain" }, { status: 400 });
    if (!files.length) return NextResponse.json({ error: "no image" }, { status: 400 });

    const plugin = getPlugin(domain);
    const images = await Promise.all(
      files.map(async (f) => ({ data: new Uint8Array(await f.arrayBuffer()), mediaType: f.type || "image/jpeg" })),
    );
    if (VISION_MOCK) return NextResponse.json(makeInventory(domain, mockItems(plugin, imageHash(images)), sourceId));
    const out = await visionObject({
      schema: inventorySchema(plugin),
      system: inventoryPrompt(plugin),
      text: images.length > 1 ? `These ${images.length} photos show the same table from different angles. Report each part once.` : "Identify the parts on the table.",
      images,
    });
    return NextResponse.json(makeInventory(domain, out.items, sourceId));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

const MOCK_COLORS = ["red", "blue", "yellow", "white", "black", "green"];

/** Deterministic fake detections: a handful of vocabulary parts with bboxes that drift with the frame. */
function mockItems(plugin: DomainPlugin, seed: number): InventoryItem[] {
  const vocab = plugin.vocabulary;
  const n = 3 + (seed % 3);
  const items: InventoryItem[] = [];
  for (let i = 0; i < n; i++) {
    const s = (seed >>> (i * 4)) ^ (seed * (i + 1));
    const part = vocab[(s >>> 3) % vocab.length];
    const cx = 0.12 + ((s >>> 7) % 76) / 100;
    const cy = 0.12 + ((s >>> 13) % 76) / 100;
    items.push({
      partType: part.id,
      qty: 1 + ((s >>> 19) % 4),
      ...(plugin.id === "lego" ? { color: MOCK_COLORS[(s >>> 23) % MOCK_COLORS.length] } : {}),
      conf: 0.7 + ((s >>> 27) % 30) / 100,
      bbox: [Math.max(0, cx - 0.08), Math.max(0, cy - 0.06), 0.16, 0.12],
    });
  }
  return items;
}
