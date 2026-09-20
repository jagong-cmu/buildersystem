"use client";
// Glasses-first scan (PRD §7, §9): the feed fills the inventory continuously while the
// wearer looks at the pile. Scan 10 s / Snap / Upload stay as secondary actions.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Inventory, PartType } from "@/core/types";
import { isDomainId, useDomain, useInventory } from "@/lib/inventory-store";
import { useDetections, recordDetections } from "@/lib/detections";
import { coverageHint, mergeWithPins } from "@/lib/live-inventory";
import { DOMAIN_LABEL, partLabel } from "@/lib/format";
import { postInventory } from "@/lib/inventory-client";
import { usePrimarySource } from "@/lib/sources";
import { InventoryEditor, cssColor } from "./InventoryEditor";
import { FrameOverlay } from "./FrameOverlay";
import { LiveFeed } from "./LiveFeed";
import { ScanControls } from "./ScanControls";
import { ScrapMeasure } from "./ScrapMeasure";
import { useLiveInventory } from "./useLiveInventory";
import { DropboxPhotos } from "./DropboxPhotos";

export function ScanView({ extraParts = [], dropbox = false }: { extraParts?: PartType[]; dropbox?: boolean }) {
  const [domain, setDomain] = useDomain();
  const [inventory, setInventory] = useInventory(domain);
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("domain");
    if (isDomainId(d)) setDomain(d);
  }, [setDomain]);
  const [sourceId, setSourceId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFrame, setLastFrame] = useState<Blob | null>(null);
  const { source, glassesOnline } = usePrimarySource();
  const detections = useDetections();
  const live = useLiveInventory({ domain, enabled: true, sourceId });
  const { status } = live;

  async function recognize(blob: Blob, sourceId: string) {
    setBusy("Identifying parts…");
    setError(null);
    setLastFrame(blob);
    try {
      const inv = await postInventory(domain, sourceId, [blob]);
      if (!inv) setError("busy — dropped");
      else applyResult(inv);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /** Explicit scan/snap/upload results also feed the overlay; pinned hand edits stay. */
  function applyResult(inv: Inventory) {
    setInventory({ ...inv, items: mergeWithPins(inv.items, inventory.items, status.pinned) });
    recordDetections(inv.items, inv.frameSeqs?.at(-1) ?? -1, inv.sourceId);
  }

  /** Hand edits are pinned so the live loop doesn't overwrite them (until Reset). */
  function edit(next: Inventory) {
    live.pinEdit(inventory, next);
    setInventory(next);
  }

  const hint = coverageHint(detections.items);
  const feedOnline = !!source?.online;
  const title = feedOnline ? (status.frozen ? "Frozen — press Resume to keep looking" : "Looking at your parts…") : "Nothing to look at yet";

  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5 p-5 max-w-7xl mx-auto min-w-0">
      <section className="space-y-3 min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-xl font-semibold">{title}</h1>
          <span className="muted text-sm">{DOMAIN_LABEL[domain]}</span>
          {feedOnline && !glassesOnline && <span className="chip warn">glasses offline · using {source?.id}</span>}
        </div>
        <LiveFeed
          onSnapshot={(blob, sourceId) => recognize(blob, sourceId)}
          onSourceChange={setSourceId}
          busy={busy}
          overlay={(frame) => <FrameOverlay domain={domain} detections={detections.items} frame={frame ?? detections.frame} />}
        />
        <LiveStatus status={status} hint={hint} onToggleFreeze={() => live.setFrozen(!status.frozen)} />
        <InventoryStrip inventory={inventory} />
        <details className="panel px-3 py-2">
          <summary className="text-sm muted cursor-pointer">More ways to scan</summary>
          <div className="flex items-center gap-3 flex-wrap mt-2">
            <ScanControls domain={domain} sourceId={sourceId} onResult={applyResult} onError={setError} onBusy={setBusy} />
            <label className="btn sm">
              Upload photo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) recognize(f, "upload");
                }}
              />
            </label>
          </div>
        </details>
        {dropbox && <DropboxPhotos domain={domain} inventory={inventory} onUse={edit} onError={setError} />}
        <div className="flex items-center gap-3 min-h-6">
          {busy && <span className="muted text-sm">{busy}</span>}
          {error && <span className="chip warn">{error}</span>}
          {status.error && <span className="chip warn">live: {status.error}</span>}
        </div>
        {domain === "fabric" && <ScrapMeasure frame={lastFrame} inventory={inventory} onChange={edit} />}
      </section>
      <section className="space-y-3 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">Inventory</h2>
          <div className="flex items-center gap-2">
            {status.pinned.size > 0 && (
              <span className="chip info" title="Hand-edited rows are kept until Reset">
                {status.pinned.size} pinned
              </span>
            )}
            <button className="btn sm" onClick={live.reset} title="Clear the inventory, unpin hand edits and restart the window">
              Reset
            </button>
            <Link href="/builds" className="btn primary">
              Find builds →
            </Link>
          </div>
        </div>
        <InventoryEditor domain={domain} inventory={inventory} onChange={edit} extraParts={extraParts} />
      </section>
    </div>
  );
}

function LiveStatus({
  status,
  hint,
  onToggleFreeze,
}: {
  status: ReturnType<typeof useLiveInventory>["status"];
  hint: string | null;
  onToggleFreeze: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const age = status.lastUpdateAt ? Math.max(0, Math.round((now - status.lastUpdateAt) / 1000)) : null;
  return (
    <div className="flex items-center gap-3 flex-wrap text-sm min-w-0">
      <span className="muted break-words min-w-0">
        processed {status.processed} frames · last update {age == null ? "—" : `${age}s ago`}
        {status.dropped > 0 && <> · {status.dropped} over cap</>}
        <span title="vision calls in the last minute"> · {status.callsThisMinute}/{status.maxPerMinute} calls/min</span>
      </span>
      {status.running && <span className="chip ok">live</span>}
      {hint && <span className="chip info">{hint}</span>}
      <button className="btn sm ml-auto" onClick={onToggleFreeze}>
        {status.frozen ? "Resume" : "Freeze"}
      </button>
    </div>
  );
}

/** Growing strip of everything seen so far. */
function InventoryStrip({ inventory }: { inventory: Inventory }) {
  if (!inventory.items.length) return <div className="muted text-sm">Nothing identified yet — look at the pile.</div>;
  return (
    <div className="flex gap-2 flex-wrap">
      {inventory.items.map((it) => (
        <span key={`${it.partType}|${it.color ?? ""}`} className="chip">
          {it.color && <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: cssColor(it.color) }} />}
          {it.qty} × {partLabel(inventory.domain, it.partType)}
        </span>
      ))}
    </div>
  );
}
