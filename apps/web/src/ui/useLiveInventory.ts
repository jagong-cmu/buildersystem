"use client";
// Continuous inventory from the primary (glasses) source (PRD §9 video mode, §7):
// poll for new frames, prefer frames after motion settled, skip unchanged seq, one
// vision call in flight (the next starts as soon as the previous returns), sliding
// window of the last few processed frames, hand-edited
// rows pinned until Reset, hard cap on vision calls per minute.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DomainId, Inventory } from "@/core/types";
import { makeInventory } from "@/core/inventory";
import { useControlBus } from "@/lib/control-bus";
import { clearDetections, recordDetections } from "@/lib/detections";
import { fetchLatestFrame } from "@/lib/frames";
import { inventoryBusy, postInventory } from "@/lib/inventory-client";
import { readInventory, writeInventory } from "@/lib/inventory-store";
import { FrameWindow, RateLimiter, changedKeys, mergeWithPins } from "@/lib/live-inventory";
import { usePrimarySource } from "@/lib/sources";

export const DEFAULT_CALLS_PER_MINUTE = Number(process.env.NEXT_PUBLIC_VISION_CALLS_PER_MINUTE ?? 60);
const PINS_KEY = (d: DomainId) => `rc:pins:${d}`;
/** While motion is active, still sample if nothing was processed for this long. */
const ACTIVE_STARVATION_MS = 2500;
/** Pause between a vision result and grabbing the next frame. */
const NEXT_FRAME_MS = 150;

export interface LiveInventoryStatus {
  running: boolean;
  frozen: boolean;
  processed: number;
  skipped: number;
  dropped: number;
  lastUpdateAt: number | null;
  callsThisMinute: number;
  maxPerMinute: number;
  sourceId: string;
  error: string | null;
  pinned: Set<string>;
}

export interface LiveInventoryOptions {
  domain: DomainId;
  enabled: boolean;
  /** Write the aggregated window to the inventory store (off on the guide: detections only). */
  writeInventory?: boolean;
  /** Consume this hub source instead of the primary one (the feed's dropdown override). */
  sourceId?: string;
  intervalMs?: number;
  maxPerMinute?: number;
  windowSize?: number;
}

function readPins(domain: DomainId): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(PINS_KEY(domain)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function useLiveInventory(opts: LiveInventoryOptions) {
  const { domain, enabled, writeInventory: write = true, intervalMs = 500, maxPerMinute = DEFAULT_CALLS_PER_MINUTE, windowSize = 4 } = opts;
  const primary = usePrimarySource();
  const override = opts.sourceId && primary.sources.find((s) => s.id === opts.sourceId);
  const source = override || primary.source;
  const sourceId = source?.id ?? "";
  const online = !!source?.online;
  const [frozen, setFrozen] = useState(false);
  const [pinned, setPinned] = useState<Set<string>>(() => new Set());
  const [stats, setStats] = useState({ processed: 0, skipped: 0, dropped: 0, lastUpdateAt: null as number | null, error: null as string | null, calls: 0 });

  const windowRef = useRef(new FrameWindow(windowSize));
  const limiter = useMemo(() => new RateLimiter(maxPerMinute), [maxPerMinute]);
  const lastSeq = useRef<number | undefined>(undefined);
  const lastProcessedAt = useRef(0);
  const pending = useRef(false);
  const motion = useRef<"active" | "settled">("settled");
  const pinnedRef = useRef(pinned);
  useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);

  // Pins are shared across tabs through localStorage, like the inventory itself.
  useEffect(() => {
    const timer = setTimeout(() => setPinned(readPins(domain)), 0);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === PINS_KEY(domain)) setPinned(readPins(domain));
    };
    window.addEventListener("storage", onStorage);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, [domain]);

  // The frame window and overlay belong to one domain's vocabulary.
  const domainRef = useRef(domain);
  useEffect(() => {
    if (domainRef.current === domain) return;
    domainRef.current = domain;
    windowRef.current.clear();
    lastSeq.current = undefined;
    clearDetections();
    setStats({ processed: 0, skipped: 0, dropped: 0, lastUpdateAt: null, error: null, calls: 0 });
  }, [domain]);

  useControlBus((msg) => {
    if (msg.type === "motion" && msg.source === sourceId) motion.current = msg.state;
  });

  const running = enabled && !frozen && online && !!sourceId;

  useEffect(() => {
    if (!running) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (ms: number) => {
      if (!alive) return;
      clearTimeout(timer);
      timer = setTimeout(() => void tick(), ms);
    };
    const tick = async (): Promise<void> => {
      if (!alive) return;
      if (pending.current || inventoryBusy()) return schedule(intervalMs);
      const now = Date.now();
      if (motion.current === "active" && now - lastProcessedAt.current < ACTIVE_STARVATION_MS) return schedule(intervalMs);
      const frame = await fetchLatestFrame(sourceId).catch(() => null);
      if (!alive) return;
      if (!frame || frame.seq === lastSeq.current) {
        if (frame) setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
        return schedule(intervalMs);
      }
      if (!limiter.allow(now)) {
        setStats((s) => ({ ...s, dropped: s.dropped + 1, calls: limiter.used(now) }));
        return schedule(intervalMs);
      }
      lastSeq.current = frame.seq;
      pending.current = true;
      try {
        const [inv, bitmap] = await Promise.all([
          postInventory(domain, sourceId, [frame.blob]),
          createImageBitmap(frame.blob).catch(() => null),
        ]);
        const size = bitmap ? { w: bitmap.width, h: bitmap.height } : undefined;
        bitmap?.close();
        if (!alive || !inv) return;
        lastProcessedAt.current = Date.now();
        windowRef.current.push(frame.seq, inv.items);
        recordDetections(inv.items, frame.seq, sourceId, size);
        if (write) {
          const current = readInventory(domain);
          const items = mergeWithPins(windowRef.current.aggregate(), current.items, pinnedRef.current);
          writeInventory(makeInventory(domain, items, sourceId, windowRef.current.seqs()));
        }
        setStats((s) => ({ ...s, processed: s.processed + 1, lastUpdateAt: Date.now(), error: null, calls: limiter.used() }));
      } catch (e) {
        if (alive) setStats((s) => ({ ...s, error: (e as Error).message }));
      } finally {
        pending.current = false;
        schedule(NEXT_FRAME_MS);
      }
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [running, sourceId, domain, intervalMs, limiter, write]);

  /** Call with the inventory before/after a hand edit: changed rows become pinned. */
  const pinEdit = useCallback(
    (before: Inventory, after: Inventory) => {
      const keys = changedKeys(before.items, after.items);
      if (!keys.length) return;
      setPinned((p) => {
        const next = new Set(p);
        keys.forEach((k) => next.add(k));
        try {
          localStorage.setItem(PINS_KEY(domain), JSON.stringify([...next]));
        } catch {}
        return next;
      });
    },
    [domain],
  );

  /** Unpin everything and start the window over (also clears the inventory). */
  const reset = useCallback(() => {
    setPinned(new Set());
    try {
      localStorage.removeItem(PINS_KEY(domain));
    } catch {}
    windowRef.current.clear();
    lastSeq.current = undefined;
    clearDetections();
    writeInventory(makeInventory(domain, [], sourceId || "manual"));
    setStats({ processed: 0, skipped: 0, dropped: 0, lastUpdateAt: null, error: null, calls: 0 });
  }, [domain, sourceId]);

  const status: LiveInventoryStatus = {
    running,
    frozen,
    processed: stats.processed,
    skipped: stats.skipped,
    dropped: stats.dropped,
    lastUpdateAt: stats.lastUpdateAt,
    callsThisMinute: stats.calls,
    maxPerMinute,
    sourceId,
    error: stats.error,
    pinned,
  };
  return { status, setFrozen, pinEdit, reset };
}
