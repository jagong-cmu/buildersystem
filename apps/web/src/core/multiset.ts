import type { Requirement } from "./types";

/** Key for grouping requirements. Color is part of the key unless matching is color-agnostic. */
export function reqKey(r: { partType: string; color?: string }, colorAware: boolean): string {
  return colorAware && r.color ? `${r.partType}|${r.color}` : r.partType;
}

export function parseKey(key: string): { partType: string; color?: string } {
  const [partType, color] = key.split("|");
  return color ? { partType, color } : { partType };
}

export type Multiset = Map<string, number>;

export function toMultiset(
  items: { partType: string; qty: number; color?: string }[],
  colorAware: boolean,
): Multiset {
  const m: Multiset = new Map();
  for (const it of items) {
    const k = reqKey(it, colorAware);
    m.set(k, (m.get(k) ?? 0) + it.qty);
  }
  return m;
}

export function fromMultiset(m: Multiset): Requirement[] {
  return [...m.entries()]
    .filter(([, qty]) => qty > 0)
    .map(([k, qty]) => ({ ...parseKey(k), qty }));
}

/** need − have, only positive remainders. */
export function subtract(need: Multiset, have: Multiset): Multiset {
  const out: Multiset = new Map();
  for (const [k, q] of need) {
    const rem = q - (have.get(k) ?? 0);
    if (rem > 0) out.set(k, rem);
  }
  return out;
}

export function total(m: Multiset): number {
  let t = 0;
  for (const q of m.values()) t += q;
  return t;
}

export function clone(m: Multiset): Multiset {
  return new Map(m);
}

/** Derive a manual's requirements from its placed parts. */
export function deriveRequires(
  parts: { partType: string; color?: string }[],
  colorAware = true,
): Requirement[] {
  return fromMultiset(toMultiset(parts.map((p) => ({ ...p, qty: 1 })), colorAware));
}
