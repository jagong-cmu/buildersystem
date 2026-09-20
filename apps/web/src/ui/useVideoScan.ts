// Video scan sampling and aggregation hook.
"use client";

import { useEffect, useRef, useState } from "react";
import type { DomainId, Inventory } from "@/core/types";
import { aggregateFrames, makeInventory } from "@/core/inventory";
import { inventoryBusy, postInventory } from "@/lib/inventory-client";
import { fetchLatestFrame } from "@/lib/frames";

export interface ScanProgress {
  active: boolean;
  sampled: number;
  identified: number;
  dropped: number;
  secondsLeft: number;
}

interface ScanSession {
  active: boolean;
  sourceId: string;
  secondsLeft: number;
  sampled: number;
  identified: number;
  dropped: number;
  lastSeq?: number;
  frames: Inventory["items"][];
  seqs: number[];
  pending: Promise<Inventory | null> | null;
}

export function useVideoScan(
  domain: DomainId,
  onResult: (inv: Inventory) => void,
  onError: (msg: string) => void,
): { progress: ScanProgress; start: (sourceId: string, seconds?: number) => void; stop: () => void } {
  const [progress, setProgress] = useState<ScanProgress>({ active: false, sampled: 0, identified: 0, dropped: 0, secondsLeft: 0 });
  const sessionRef = useRef<ScanSession | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
  }, [onResult, onError]);

  const update = (session: ScanSession) =>
    setProgress({
      active: session.active,
      sampled: session.sampled,
      identified: session.identified,
      dropped: session.dropped,
      secondsLeft: session.secondsLeft,
    });

  const finish = async (session: ScanSession) => {
    if (session.pending) await session.pending;
    if (session.identified) onResultRef.current(makeInventory(domain, aggregateFrames(session.frames), session.sourceId, session.seqs));
    if (sessionRef.current === session) sessionRef.current = null;
  };

  const stop = () => {
    const session = sessionRef.current;
    if (!session?.active) return;
    session.active = false;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = undefined;
    update(session);
    void finish(session);
  };

  const start = (sourceId: string, seconds = 10) => {
    if (sessionRef.current?.active) return;
    const session: ScanSession = {
      active: true,
      sourceId,
      secondsLeft: seconds,
      sampled: 0,
      identified: 0,
      dropped: 0,
      frames: [],
      seqs: [],
      pending: null,
    };
    sessionRef.current = session;
    update(session);
    timerRef.current = setInterval(async () => {
      if (!session.active) return;
      const frame = await fetchLatestFrame(session.sourceId);
      if (!session.active || !frame || frame.seq === session.lastSeq) return;
      session.lastSeq = frame.seq;
      session.sampled++;
      if (inventoryBusy()) {
        session.dropped++;
      } else {
        const pending = postInventory(domain, session.sourceId, [frame.blob]);
        session.pending = pending;
        pending
          .then((inv) => {
            if (inv) {
              session.identified++;
              session.frames.push(inv.items);
              session.seqs.push(frame.seq);
            }
            update(session);
          })
          .catch((e) => onErrorRef.current((e as Error).message))
          .finally(() => {
            if (session.pending === pending) session.pending = null;
          });
      }
      session.secondsLeft--;
      update(session);
      if (session.secondsLeft <= 0) stop();
    }, 1000);
  };

  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = undefined;
      if (session) session.active = false;
    },
    [],
  );

  return { progress, start, stop };
}
