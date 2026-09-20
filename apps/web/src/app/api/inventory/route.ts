import { NextResponse } from "next/server";
import type { DomainId } from "@/core/types";
import { detectInventory } from "@/lib/inventory-service";

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

    const images = await Promise.all(
      files.map(async (f) => ({ data: new Uint8Array(await f.arrayBuffer()), mediaType: f.type || "image/jpeg" })),
    );
    return NextResponse.json(await detectInventory(domain, images, sourceId, images.length > 1 ? `These ${images.length} photos show the same table from different angles. Report each part once.` : "Identify the parts on the table."));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
