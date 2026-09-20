"use client";
// Source model (PRD §7): the glasses are the primary observation source; the phone
// PWA and anything else are fallbacks. One shared poller of the hub's /sources.
import { useSyncExternalStore } from "react";
import { fetchSources, type SourceStatus } from "@/lib/hub";

export const GLASSES_KIND = "glasses";

const KIND_RANK: Record<string, number> = { glasses: 0, phone: 1 };
const rank = (s: SourceStatus) => KIND_RANK[s.kind] ?? 2;

/** Online glasses → online phone → any online → offline glasses → offline phone → anything → null. */
export function pickPrimarySource(sources: SourceStatus[]): SourceStatus | null {
  if (!sources.length) return null;
  const sorted = [...sources].sort((a, b) => Number(b.online) - Number(a.online) || rank(a) - rank(b) || a.id.localeCompare(b.id));
  return sorted[0] ?? null;
}

export function glassesSource(sources: SourceStatus[]): SourceStatus | null {
  const all = sources.filter((s) => s.kind === GLASSES_KIND);
  return all.find((s) => s.online) ?? all[0] ?? null;
}

export interface SourcesSnapshot {
  sources: SourceStatus[];
  hubOnline: boolean;
  /** ms epoch of the last successful poll (0 before the first). */
  polledAt: number;
}

const EMPTY: SourcesSnapshot = { sources: [], hubOnline: false, polledAt: 0 };
let snapshot: SourcesSnapshot = EMPTY;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let inFlight = false;

async function poll() {
  if (inFlight) return;
  inFlight = true;
  try {
    const sources = await fetchSources();
    snapshot = { sources, hubOnline: true, polledAt: Date.now() };
  } catch {
    snapshot = { sources: snapshot.sources.map((s) => ({ ...s, online: false })), hubOnline: false, polledAt: Date.now() };
  } finally {
    inFlight = false;
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!timer) {
    void poll();
    timer = setInterval(poll, 2000);
  }
  return () => {
    listeners.delete(l);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useSources(): SourcesSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}

export interface PrimarySource {
  /** The source every consumer should show by default (null while nothing is known). */
  source: SourceStatus | null;
  sourceId: string;
  glasses: SourceStatus | null;
  glassesOnline: boolean;
  sources: SourceStatus[];
  hubOnline: boolean;
}

export function usePrimarySource(): PrimarySource {
  const { sources, hubOnline } = useSources();
  const source = pickPrimarySource(sources);
  const glasses = glassesSource(sources);
  return { source, sourceId: source?.id ?? "", glasses, glassesOnline: !!glasses?.online, sources, hubOnline };
}

/** Age of the newest frame in seconds, or null when unknown. */
export function frameAgeSeconds(s: SourceStatus | null, now = Date.now()): number | null {
  if (!s || s.latestTs == null) return null;
  return Math.max(0, (now - s.latestTs) / 1000);
}

export const OFFLINE_GUIDANCE = "Put on the glasses and start the bridge, or open /source/phone on a phone.";
