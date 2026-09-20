"use client";
import Link from "next/link";
import { useState } from "react";
import { useDomain, useInventory } from "@/lib/inventory-store";
import { InventoryEditor } from "./InventoryEditor";
import { LiveFeed } from "./LiveFeed";
import { ScanControls } from "./ScanControls";
import { DOMAIN_LABEL } from "@/lib/format";
import { postInventory } from "@/lib/inventory-client";

export function ScanView() {
  const [domain] = useDomain();
  const [inventory, setInventory] = useInventory(domain);
  const [sourceId, setSourceId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function recognize(blob: Blob, sourceId: string) {
    setBusy("Identifying parts…");
    setError(null);
    try {
      const inv = await postInventory(domain, sourceId, [blob]);
      if (!inv) setError("busy — dropped");
      else setInventory(inv);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5 p-5 max-w-7xl mx-auto">
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Scan · {DOMAIN_LABEL[domain]}</h1>
        <LiveFeed onSnapshot={(blob, sourceId) => recognize(blob, sourceId)} onSourceChange={setSourceId} busy={busy} />
        <ScanControls domain={domain} sourceId={sourceId} onResult={setInventory} onError={setError} onBusy={setBusy} />
        <div className="flex items-center gap-3">
          <label className="btn">
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
          {busy && <span className="muted text-sm">{busy}</span>}
          {error && <span className="chip warn">{error}</span>}
        </div>
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Inventory</h2>
          <Link href="/builds" className="btn primary">
            Find builds →
          </Link>
        </div>
        <InventoryEditor domain={domain} inventory={inventory} onChange={setInventory} />
      </section>
    </div>
  );
}
