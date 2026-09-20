import { NextResponse } from "next/server";
import { getPlugin } from "@/domains";
import type { DomainId } from "@/core/types";
import { inventoryPrompt, inventorySchema, makeInventory } from "@/core/inventory";
import { visionObject } from "@/lib/vision";

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
