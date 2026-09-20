// Scoring for the vision inventory eval (eval/vision): key P/R/F1 + quantity accuracy.
// Key = partType, plus ":" + color for LEGO (the only domain where color is part of the truth).
import type { DomainId } from "./types";

export type TruthItem = { partType: string; color?: string; qty: number };
export type PredItem = { partType: string; color?: string; qty: number };

export type InventoryScore = {
  precision: number;
  recall: number;
  f1: number;
  qtyExact: number;
  qtyMae: number | null;
  missing: string[];
  extra: string[];
};

export const inventoryKey = (it: { partType: string; color?: string }, useColor: boolean) =>
  useColor && it.color ? `${it.partType}:${it.color.toLowerCase().trim()}` : it.partType;

export function scoreInventory(truth: TruthItem[], pred: PredItem[], domain: DomainId): InventoryScore {
  const useColor = domain === "lego";
  const t = new Map<string, number>();
  for (const it of truth) t.set(inventoryKey(it, useColor), (t.get(inventoryKey(it, useColor)) ?? 0) + it.qty);
  const p = new Map<string, number>();
  for (const it of pred) p.set(inventoryKey(it, useColor), (p.get(inventoryKey(it, useColor)) ?? 0) + it.qty);
  const tp = [...t.keys()].filter((k) => p.has(k)).length;
  const precision = p.size ? tp / p.size : 0;
  const recall = t.size ? tp / t.size : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  let exact = 0;
  let absErr = 0;
  for (const [k, q] of t) {
    const pq = p.get(k);
    if (pq === undefined) continue;
    if (pq === q) exact++;
    absErr += Math.abs(pq - q);
  }
  return {
    precision,
    recall,
    f1,
    qtyExact: t.size ? exact / t.size : 0,
    qtyMae: tp ? absErr / tp : null,
    missing: [...t.keys()].filter((k) => !p.has(k)),
    extra: [...p.keys()].filter((k) => !t.has(k)),
  };
}
