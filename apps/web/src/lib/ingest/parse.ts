import { z } from "zod";
import type { PagePlacement } from "@/core/types";
import { visionObject } from "@/lib/vision";

export const parsedStepSchema = z.object({
  n: z.number().int().positive().optional(),
  text: z.string(),
  partsUsed: z.array(z.object({ name: z.string(), qty: z.number().positive() })),
  region: z.object({ page: z.number().int().positive(), bbox: z.array(z.number()).length(4) }),
  cautions: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),
});
export const parsedDocumentSchema = z.object({
  steps: z.array(parsedStepSchema),
  partsList: z.array(z.object({ name: z.string(), qty: z.number().positive(), notes: z.string().optional() })).optional(),
  detectedDomain: z.enum(["lego", "breadboard", "fabric", "other"]).optional(),
});
export type ParsedDocument = z.infer<typeof parsedDocumentSchema>;
export type ParsedStep = z.infer<typeof parsedStepSchema>;

export function mergePages(perPage: ParsedDocument[]): ParsedStep[] {
  return perPage
    .flatMap((page) => page.steps)
    .sort((a, b) => a.region.page - b.region.page || (a.n ?? Number.MAX_SAFE_INTEGER) - (b.n ?? Number.MAX_SAFE_INTEGER))
    .map((step, index) => ({ ...step, n: index + 1 }));
}

export async function parsePages(pages: Uint8Array[], opts: { pageOffset?: number; model?: string } = {}) {
  const pageOffset = opts.pageOffset ?? 1;
  const perPage: ParsedDocument[] = [];
  for (let i = 0; i < pages.length; i += 2) {
    const batch = pages[i]?.length < 400 * 1024 && pages[i + 1]?.length < 400 * 1024 ? pages.slice(i, i + 2) : pages.slice(i, i + 1);
    const result = await visionObject({
      schema: parsedDocumentSchema,
      model: opts.model,
      system: "You extract physical construction instructions from manual pages. Use the manual's own step numbering when visible. Describe the physical action, not the picture. Every bbox must be normalized x,y,w,h within the actual page.",
      text: `Parse these manual pages. Their actual 1-based page indices are ${batch.map((_, j) => pageOffset + i + j).join(", ")}. Assign each step region to its actual page index.`,
      images: batch.map((data) => ({ data, mediaType: "image/png" })),
    });
    if (batch.length === 2) perPage.push(result);
    else perPage.push({ ...result, steps: result.steps.map((step) => ({ ...step, region: { ...step.region, page: pageOffset + i } })) });
  }
  return { perPage, steps: mergePages(perPage) };
}

export function placement(step: ParsedStep): PagePlacement {
  return { kind: "page", page: step.region.page, bbox: step.region.bbox as [number, number, number, number] };
}
