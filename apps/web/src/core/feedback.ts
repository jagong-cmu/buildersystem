// User corrections of scan results (PRD §9): the labelled frame becomes an eval case
// and a few-shot exemplar for later vision calls. Pure helpers; disk I/O lives in lib/feedback.ts.
import type { DomainId, InventoryItem } from "./types";
import { inventoryKey, type TruthItem } from "./inventory-score";

export type Box = [number, number, number, number];

export interface PredictedItem {
  partType: string;
  color?: string;
  qty: number;
  conf?: number;
  bbox?: Box;
  boxes?: Box[];
}

/** truth.json of a correction case; a superset of the curated eval layout so the eval harness can score it. */
export interface CorrectionCase {
  id: string;
  domain: DomainId;
  at: string;
  sourceId: string;
  source: "correction";
  items: TruthItem[];
  predicted: PredictedItem[];
  /** Predicted rows the user removed: crop file per box, used as negative exemplars. */
  rejected: { partType: string; color?: string; file: string }[];
  note?: string;
}

export interface CorrectionInput {
  domain: DomainId;
  sourceId: string;
  items: InventoryItem[] | TruthItem[];
  predicted: PredictedItem[];
  note?: string;
}

export const truthKey = (
  it: { partType: string; color?: string },
  domain: DomainId,
) => inventoryKey(it, domain === "lego");

export function toTruthItems(
  items: { partType: string; color?: string; qty: number }[],
): TruthItem[] {
  return items
    .filter((it) => it.qty > 0)
    .map((it) => ({
      partType: it.partType,
      ...(it.color ? { color: it.color.toLowerCase().trim() } : {}),
      qty: it.qty,
    }))
    .sort(
      (a, b) =>
        a.partType.localeCompare(b.partType) ||
        (a.color ?? "").localeCompare(b.color ?? ""),
    );
}

/** Predicted rows whose key the user did not keep: each gets cropped as a "this is not a part" exemplar. */
export function rejectedPredictions(
  domain: DomainId,
  predicted: PredictedItem[],
  truth: TruthItem[],
): PredictedItem[] {
  const keep = new Set(truth.map((t) => truthKey(t, domain)));
  return predicted.filter((p) => !keep.has(truthKey(p, domain)));
}

/** Truth keys the model never proposed (recall misses): surfaced as a text hint next to the scene exemplar. */
export function missedTruth(
  domain: DomainId,
  predicted: PredictedItem[],
  truth: TruthItem[],
): TruthItem[] {
  const seen = new Set(predicted.map((p) => truthKey(p, domain)));
  return truth.filter((t) => !seen.has(truthKey(t, domain)));
}

export function correctionId(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 23);
}

/** Boxes to crop for a rejected row: every instance box, else the representative one. Clamped and never degenerate. */
export function cropBoxes(p: PredictedItem, max = 3): Box[] {
  const raw = p.boxes?.length ? p.boxes : p.bbox ? [p.bbox] : [];
  return raw
    .map(([x, y, w, h]): Box => {
      const x0 = Math.min(1, Math.max(0, x));
      const y0 = Math.min(1, Math.max(0, y));
      return [
        x0,
        y0,
        Math.min(1 - x0, Math.max(0, w)),
        Math.min(1 - y0, Math.max(0, h)),
      ];
    })
    .filter(([, , w, h]) => w > 0.01 && h > 0.01)
    .slice(0, max);
}

export function describeItems(items: TruthItem[]): string {
  if (!items.length) return "no parts at all (empty scene)";
  return items
    .map((t) => `${t.qty} × ${t.partType}${t.color ? ` (${t.color})` : ""}`)
    .join(", ");
}

export interface ExemplarImage {
  data: Uint8Array;
  mediaType: string;
}

export interface SceneExemplar {
  kind: "scene";
  image: ExemplarImage;
  items: TruthItem[];
  missed: TruthItem[];
  rejected: { partType: string; color?: string }[];
}

export interface NegativeExemplar {
  kind: "negative";
  image: ExemplarImage;
  partType: string;
  color?: string;
}

export type Exemplar = SceneExemplar | NegativeExemplar;

export type VisionPart =
  | { type: "text"; text: string }
  | { type: "image"; data: Uint8Array; mediaType: string };

/** Few-shot prefix placed before the frame to scan. Empty when there is nothing to show. */
export function exemplarParts(exemplars: Exemplar[]): VisionPart[] {
  if (!exemplars.length) return [];
  const parts: VisionPart[] = [
    {
      type: "text",
      text: "Reference examples the user labelled in this same workspace (same camera, lighting and parts). Match their labelling exactly: report the parts they confirmed and never report anything resembling what they rejected.",
    },
  ];
  let scene = 0;
  let neg = 0;
  for (const ex of exemplars) {
    if (ex.kind === "scene") {
      scene++;
      const lines = [
        `Example scene ${scene}: contains exactly ${describeItems(ex.items)}.`,
      ];
      if (ex.missed.length)
        lines.push(
          `The scanner previously missed ${describeItems(ex.missed)} here.`,
        );
      if (ex.rejected.length)
        lines.push(
          `The scanner previously invented ${ex.rejected.map((r) => `${r.partType}${r.color ? ` (${r.color})` : ""}`).join(", ")} here; those are wrong.`,
        );
      parts.push(
        { type: "text", text: lines.join(" ") },
        { type: "image", ...ex.image },
      );
    } else {
      neg++;
      parts.push(
        {
          type: "text",
          text: `Rejected crop ${neg}: was wrongly reported as ${ex.partType}${ex.color ? ` (${ex.color})` : ""}. It is not that part; do not report it or anything like it.`,
        },
        { type: "image", ...ex.image },
      );
    }
  }
  parts.push({
    type: "text",
    text: "End of reference examples. Now scan the following frame.",
  });
  return parts;
}

export const EXEMPLAR_LIMITS = { scenes: 4, negatives: 6 };

/** Newest first, capped: a few full scenes plus a few rejected crops keep the prompt small. */
export function selectExemplars(
  all: Exemplar[],
  limits = EXEMPLAR_LIMITS,
): Exemplar[] {
  const scenes = all
    .filter((e): e is SceneExemplar => e.kind === "scene")
    .slice(0, limits.scenes);
  const negatives = all
    .filter((e): e is NegativeExemplar => e.kind === "negative")
    .slice(0, limits.negatives);
  return [...scenes, ...negatives];
}
