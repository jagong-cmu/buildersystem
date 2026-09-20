import { NextResponse } from "next/server";
import { z } from "zod";
import type { DomainId } from "@/core/types";
import { isDomainId } from "@/lib/inventory-store";
import { feedbackStats, saveCorrection } from "@/lib/feedback";

export const runtime = "nodejs";

const box = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const row = z.object({
  partType: z.string().min(1),
  color: z.string().optional(),
  qty: z.number().int().min(0).max(500),
});
const predicted = row.extend({
  conf: z.number().optional(),
  bbox: box.optional(),
  boxes: z.array(box).optional(),
});
const body = z.object({
  items: z.array(row),
  predicted: z.array(predicted).default([]),
  note: z.string().max(300).optional(),
});

/** GET ?domain= → how many corrections are stored for the domain. */
export async function GET(req: Request) {
  const domain = new URL(req.url).searchParams.get("domain");
  if (!isDomainId(domain))
    return NextResponse.json({ error: "bad domain" }, { status: 400 });
  return NextResponse.json(await feedbackStats(domain));
}

/** POST multipart: domain, sourceId, image, correction (JSON: items = truth, predicted = what the model said) → saved case. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const domain = String(form.get("domain") ?? "") as DomainId;
    if (!isDomainId(domain))
      return NextResponse.json({ error: "bad domain" }, { status: 400 });
    const image = form.get("image");
    if (!(image instanceof File))
      return NextResponse.json({ error: "no image" }, { status: 400 });
    const parsed = body.safeParse(
      JSON.parse(String(form.get("correction") ?? "{}")),
    );
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.message },
        { status: 400 },
      );
    const saved = await saveCorrection(
      {
        domain,
        sourceId: String(form.get("sourceId") ?? "upload"),
        ...parsed.data,
      },
      {
        data: new Uint8Array(await image.arrayBuffer()),
        mediaType: image.type || "image/jpeg",
      },
    );
    return NextResponse.json({
      saved: {
        id: saved.id,
        items: saved.items.length,
        rejected: saved.rejected.length,
      },
      stats: await feedbackStats(domain),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
