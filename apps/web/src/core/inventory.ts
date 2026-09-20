// Inventory service (PRD §9): vocabulary-constrained structured output + video aggregation.
import { z } from "zod";
import type { DomainPlugin } from "./plugin";
import type { DomainId, Inventory, InventoryItem } from "./types";

export function inventorySchema(plugin: DomainPlugin) {
  const ids = plugin.vocabulary.map((p) => p.id) as [string, ...string[]];
  const item = z.object({
    partType: z.enum(ids),
    qty: z.number().int().min(1).max(200),
    color: z.string().optional().describe("Dominant color name, lowercase, only when meaningful (LEGO)."),
    conf: z.number().min(0).max(1),
    bbox: z
      .tuple([z.number(), z.number(), z.number(), z.number()])
      .optional()
      .describe("Normalized [x, y, w, h] of one representative instance, 0..1."),
    polygonMm: z
      .array(z.tuple([z.number(), z.number()]))
      .optional()
      .describe("Fabric only: outline of the scrap in millimetres, using the marker mat for scale."),
    attrs: z.record(z.string(), z.union([z.number(), z.string()])).optional().describe("e.g. { lengthMm: 180 } for a zipper"),
  });
  return z.object({ items: z.array(item) });
}

export function inventoryPrompt(plugin: DomainPlugin): string {
  const vocab = plugin.vocabulary.map((p) => `- ${p.id}: ${p.name} — ${p.visionHint}`).join("\n");
  const domainNotes: Record<DomainId, string> = {
    lego:
      "Count each brick type per color. Report color names in lowercase (red, blue, yellow, white, black, green, light gray, dark gray, tan, orange). Count carefully; when unsure between two types, prefer the more common one and lower the confidence.",
    breadboard:
      "Count discrete components. Read resistor color bands to pick the value; if unreadable, choose the closest vocabulary value with low confidence. Count jumper wires individually. Report the board and breadboard if present.",
    fabric:
      "Each fabric scrap is one item with qty 1 and its outline as polygonMm (use the printed marker mat, 40 mm squares, for scale). Classify the fabric. For a zipper, report attrs.lengthMm.",
  };
  return [
    `You are the inventory scanner for a ${plugin.id} build assistant. Identify every part visible on the table.`,
    "Only use part types from this vocabulary (ids are exact):",
    vocab,
    domainNotes[plugin.id],
    "If nothing from the vocabulary is visible, return an empty items list. Never invent part types.",
  ].join("\n\n");
}

/**
 * Aggregate per-frame detections from a scan window: per part type/color take the
 * MAX quantity seen in any single frame (never the sum: the same brick is in every frame).
 */
export function aggregateFrames(frames: InventoryItem[][]): InventoryItem[] {
  const best = new Map<string, InventoryItem & { n: number; confSum: number }>();
  for (const items of frames)
    for (const it of items) {
      const k = `${it.partType}|${it.color ?? ""}`;
      const cur = best.get(k);
      if (!cur) best.set(k, { ...it, n: 1, confSum: it.conf });
      else {
        cur.n++;
        cur.confSum += it.conf;
        if (it.qty > cur.qty) cur.qty = it.qty;
        if (it.bbox === undefined) delete cur.bbox;
        else cur.bbox = it.bbox;
        if (it.polygonMm === undefined) delete cur.polygonMm;
        else cur.polygonMm = it.polygonMm;
        if (it.attrs === undefined) delete cur.attrs;
        else cur.attrs = it.attrs;
      }
    }
  return [...best.values()].map(({ n, confSum, ...it }) => ({ ...it, conf: confSum / n }));
}

export function makeInventory(domain: DomainId, items: InventoryItem[], sourceId: string, frameSeqs: number[] = []): Inventory {
  return { domain, items, capturedAt: new Date().toISOString(), sourceId, frameSeqs };
}
