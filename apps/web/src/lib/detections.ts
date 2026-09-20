"use client";
// Latest detection per part type/color, shared by the overlay, /scan and the guide.
// Labels persist between vision calls; a row is dropped only when a newer frame
// was processed without it `STALE_FRAMES` times in a row.
import { useSyncExternalStore } from "react";
import type { InventoryItem } from "@/core/types";
import { keyOf } from "@/lib/live-inventory";

export interface Detection extends InventoryItem {
  /** hub frame seq the bbox came from */
  seq: number;
  at: number;
  /** consecutive processed frames that did not contain this part */
  misses: number;
}

export interface DetectionState {
  items: Detection[];
  frame: { w: number; h: number } | null;
  sourceId: string;
  processed: number;
  updatedAt: number;
}

const STALE_FRAMES = 4;
const EMPTY: DetectionState = { items: [], frame: null, sourceId: "", processed: 0, updatedAt: 0 };
let state: DetectionState = EMPTY;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function recordDetections(items: InventoryItem[], seq: number, sourceId: string, frame?: { w: number; h: number }) {
  const now = Date.now();
  const seen = new Map(items.map((it) => [keyOf(it), it] as const));
  const next: Detection[] = [];
  for (const prev of state.items) {
    const fresh = seen.get(keyOf(prev));
    if (fresh) continue;
    if (prev.misses + 1 < STALE_FRAMES) next.push({ ...prev, misses: prev.misses + 1 });
  }
  for (const it of items) next.push({ ...it, seq, at: now, misses: 0 });
  state = { items: next, frame: frame ?? state.frame, sourceId, processed: state.processed + 1, updatedAt: now };
  emit();
}

export function clearDetections() {
  state = { ...EMPTY };
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useDetections(): DetectionState {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}

/** Detections matching a requirement (color-aware when the requirement has a color). */
export function detectionsFor(items: Detection[], partType: string, color?: string): Detection[] {
  return items.filter((d) => d.partType === partType && (!color || (d.color ?? "") === color));
}
