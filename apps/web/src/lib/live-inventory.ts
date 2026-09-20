// Pure helpers for continuous inventory from the glasses feed (PRD §9 video mode).
import type { InventoryItem } from "@/core/types";
import { aggregateFrames } from "@/core/inventory";

export const itemKey = (partType: string, color?: string) => `${partType}|${color ?? ""}`;
export const keyOf = (it: { partType: string; color?: string }) => itemKey(it.partType, it.color);

/** Sliding window of the last N processed frames, aggregated max-not-sum. */
export class FrameWindow {
  private frames: { seq: number; items: InventoryItem[] }[] = [];
  constructor(readonly size = 8) {}
  push(seq: number, items: InventoryItem[]) {
    this.frames.push({ seq, items });
    if (this.frames.length > this.size) this.frames.splice(0, this.frames.length - this.size);
  }
  get length() {
    return this.frames.length;
  }
  seqs(): number[] {
    return this.frames.map((f) => f.seq);
  }
  aggregate(): InventoryItem[] {
    return aggregateFrames(this.frames.map((f) => f.items)).sort((a, b) => a.partType.localeCompare(b.partType));
  }
  clear() {
    this.frames = [];
  }
}

/**
 * Merge freshly aggregated detections with the current inventory, keeping rows
 * the user edited by hand (pinned) exactly as they are.
 */
export function mergeWithPins(aggregated: InventoryItem[], current: InventoryItem[], pinned: Set<string>): InventoryItem[] {
  const out = aggregated.filter((it) => !pinned.has(keyOf(it)));
  for (const it of current) if (pinned.has(keyOf(it))) out.push(it);
  return out.sort((a, b) => a.partType.localeCompare(b.partType) || (a.color ?? "").localeCompare(b.color ?? ""));
}

/** Keys whose quantity differs between two item lists (what a hand edit touched). */
export function changedKeys(before: InventoryItem[], after: InventoryItem[]): string[] {
  const qty = (items: InventoryItem[]) => new Map(items.map((it) => [keyOf(it), it.qty] as const));
  const a = qty(before);
  const b = qty(after);
  const keys = new Set([...a.keys(), ...b.keys()]);
  return [...keys].filter((k) => (a.get(k) ?? 0) !== (b.get(k) ?? 0));
}

/** Sliding one-minute cap on vision calls. */
export class RateLimiter {
  private stamps: number[] = [];
  constructor(public maxPerMinute = 30) {}
  allow(now = Date.now()): boolean {
    this.stamps = this.stamps.filter((t) => now - t < 60_000);
    if (this.stamps.length >= this.maxPerMinute) return false;
    this.stamps.push(now);
    return true;
  }
  used(now = Date.now()): number {
    return this.stamps.filter((t) => now - t < 60_000).length;
  }
}

/** Where a normalized bbox sits in the wearer's view, e.g. "bottom left". */
export function locationPhrase(bbox: [number, number, number, number]): string {
  const cx = bbox[0] + bbox[2] / 2;
  const cy = bbox[1] + bbox[3] / 2;
  const v = cy < 0.34 ? "top" : cy > 0.66 ? "bottom" : "";
  const h = cx < 0.34 ? "left" : cx > 0.66 ? "right" : "";
  return [v, h].filter(Boolean).join(" ") || "center";
}

/**
 * Coverage hint from the bbox distribution: if detections cluster on one side,
 * the rest of the pile is probably out of frame on the other side.
 */
export function coverageHint(items: InventoryItem[]): string | null {
  const boxes = items.map((it) => it.bbox).filter((b): b is [number, number, number, number] => !!b);
  if (boxes.length < 2) return null;
  const cx = boxes.reduce((s, b) => s + b[0] + b[2] / 2, 0) / boxes.length;
  const cy = boxes.reduce((s, b) => s + b[1] + b[3] / 2, 0) / boxes.length;
  const dirs: string[] = [];
  if (cx > 0.62) dirs.push("right");
  else if (cx < 0.38) dirs.push("left");
  if (cy > 0.62) dirs.push("down");
  else if (cy < 0.38) dirs.push("up");
  return dirs.length ? `look further ${dirs.join(" and ")}` : null;
}
