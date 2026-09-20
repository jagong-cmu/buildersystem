"use client";
import Link from "next/link";
import { useState } from "react";
import { useDomain, useInventory } from "@/lib/inventory-store";
import { InventoryEditor } from "./InventoryEditor";
import { LiveFeed } from "./LiveFeed";
import { ScrapMeasure } from "./ScrapMeasure";
import { DOMAIN_LABEL } from "@/lib/format";
import type { Inventory } from "@/core/types";

export function ScanView() {
  const [domain] = useDomain();
  const [inventory, setInventory] = useInventory(domain);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFrame, setLastFrame] = useState<Blob | null>(null);

  async function recognize(blob: Blob, sourceId: string) {
    setBusy("Identifying parts…");
    setError(null);
    setLastFrame(blob);
    try {
      const fd = new FormData();
      fd.append("domain", domain);
      fd.append("sourceId", sourceId);
      fd.append("image", blob, "frame.jpg");
      const res = await fetch("/api/inventory", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      const inv = (await res.json()) as Inventory;
      setInventory(inv);
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
        <LiveFeed onSnapshot={(blob, sourceId) => recognize(blob, sourceId)} busy={busy} />
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
        {domain === "fabric" && <ScrapMeasure frame={lastFrame} inventory={inventory} onChange={setInventory} />}
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
