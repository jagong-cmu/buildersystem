"use client";
// Session inventory lives in the browser (PRD §16: no database). One inventory per domain.
import { useCallback, useSyncExternalStore } from "react";
import type { DomainId, Inventory, InventoryItem } from "@/core/types";

const KEY = (d: DomainId) => `rc:inventory:${d}`;
const DOMAIN_KEY = "rc:domain";

export function emptyInventory(domain: DomainId): Inventory {
  return { domain, items: [], capturedAt: new Date().toISOString(), sourceId: "manual", frameSeqs: [] };
}

/** Parse a stored inventory; anything malformed (bad JSON, wrong shape) reads as empty. */
function parseInventory(raw: string | null, domain: DomainId): Inventory {
  if (!raw) return emptyInventory(domain);
  try {
    const parsed = JSON.parse(raw) as Partial<Inventory> | null;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) return emptyInventory(domain);
    return { ...emptyInventory(domain), ...parsed, domain, items: parsed.items.filter((it) => it && typeof it.partType === "string" && typeof it.qty === "number") };
  } catch {
    return emptyInventory(domain);
  }
}

export function readInventory(domain: DomainId): Inventory {
  if (typeof window === "undefined") return emptyInventory(domain);
  try {
    return parseInventory(window.localStorage.getItem(KEY(domain)), domain);
  } catch {
    return emptyInventory(domain);
  }
}

export function writeInventory(inv: Inventory) {
  try {
    window.localStorage.setItem(KEY(inv.domain), JSON.stringify(inv));
    window.dispatchEvent(new CustomEvent("rc:inventory", { detail: inv.domain }));
  } catch {
    /* private mode etc. */
  }
}

export function readDomain(): DomainId {
  if (typeof window === "undefined") return "lego";
  const d = window.localStorage.getItem(DOMAIN_KEY) as DomainId | null;
  return d && ["lego", "breadboard", "fabric"].includes(d) ? d : "lego";
}

export function writeDomain(d: DomainId) {
  try {
    window.localStorage.setItem(DOMAIN_KEY, d);
    window.dispatchEvent(new CustomEvent("rc:domain", { detail: d }));
  } catch {
    /* ignore */
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("rc:domain", cb);
  window.addEventListener("rc:inventory", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("rc:domain", cb);
    window.removeEventListener("rc:inventory", cb);
    window.removeEventListener("storage", cb);
  };
}

// getSnapshot must return a stable reference while the stored value is unchanged.
const invCache = new Map<DomainId, { raw: string | null; value: Inventory }>();
function inventorySnapshot(domain: DomainId): Inventory {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY(domain));
  } catch {
    /* ignore */
  }
  const cached = invCache.get(domain);
  if (cached && cached.raw === raw) return cached.value;
  const value = parseInventory(raw, domain);
  invCache.set(domain, { raw, value });
  return value;
}
const serverInv = new Map<DomainId, Inventory>();
function serverInventory(domain: DomainId): Inventory {
  let v = serverInv.get(domain);
  if (!v) serverInv.set(domain, (v = emptyInventory(domain)));
  return v;
}

export function useDomain(): [DomainId, (d: DomainId) => void] {
  const domain = useSyncExternalStore(subscribe, readDomain, () => "lego" as DomainId);
  const setDomain = useCallback((d: DomainId) => writeDomain(d), []);
  return [domain, setDomain];
}

export function useInventory(domain: DomainId): [Inventory, (next: Inventory) => void] {
  const inv = useSyncExternalStore(
    subscribe,
    () => inventorySnapshot(domain),
    () => serverInventory(domain),
  );
  const set = useCallback((next: Inventory) => writeInventory(next), []);
  return [inv, set];
}

/** Set the quantity of one part type (and optional color); removes the row at 0. */
export function withQty(inv: Inventory, partType: string, qty: number, color?: string): Inventory {
  const items = inv.items.filter((it) => !(it.partType === partType && (it.color ?? "") === (color ?? "")));
  const existing = inv.items.find((it) => it.partType === partType && (it.color ?? "") === (color ?? ""));
  const next: InventoryItem[] = qty > 0 ? [...items, { ...(existing ?? { conf: 1 }), partType, color, qty }] : items;
  return { ...inv, items: next.sort((a, b) => a.partType.localeCompare(b.partType)), capturedAt: new Date().toISOString() };
}
