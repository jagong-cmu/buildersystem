// Video scan and burst controls.
"use client";

import type { DomainId, Inventory } from "@/core/types";
import { inventoryBusy, postInventory } from "@/lib/inventory-client";
import { snapBurst } from "@/lib/frames";
import { useControlBus } from "@/lib/control-bus";
import { useVideoScan } from "./useVideoScan";

export function ScanControls({
  domain,
  sourceId,
  onResult,
  onError,
  onBusy,
}: {
  domain: DomainId;
  sourceId: string;
  onResult: (inv: Inventory) => void;
  onError: (msg: string) => void;
  onBusy: (msg: string | null) => void;
}) {
  const { progress, start, stop } = useVideoScan(domain, onResult, onError);

  useControlBus((msg) => {
    if (msg.type === "scan.start") start(msg.source ?? sourceId, msg.seconds);
    if (msg.type === "scan.stop") stop();
  });

  const snap = async () => {
    if (inventoryBusy()) return;
    onBusy("Identifying 3 frames…");
    try {
      const blobs = await snapBurst(sourceId);
      const inv = await postInventory(domain, sourceId, blobs);
      if (inv) onResult(inv);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      onBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {!progress.active ? (
        <button className="btn primary sm" disabled={!sourceId} onClick={() => start(sourceId)}>
          Scan 10 s
        </button>
      ) : (
        <>
          <button className="btn sm" onClick={stop}>
            Stop
          </button>
          <span className="muted text-sm">
            Scanning… {progress.sampled} sampled · {progress.identified} identified · {progress.dropped} dropped · {progress.secondsLeft}s
          </span>
        </>
      )}
      <button className="btn sm" disabled={!sourceId || progress.active || inventoryBusy()} onClick={snap}>
        Snap 3
      </button>
    </div>
  );
}
