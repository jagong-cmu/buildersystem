// Client for inventory recognition requests.
import type { DomainId, Inventory } from "@/core/types";

let inFlight = false;

export function inventoryBusy() {
  return inFlight;
}

export async function postInventory(domain: DomainId, sourceId: string, images: Blob[]): Promise<Inventory | null> {
  if (inFlight) return null;
  inFlight = true;
  try {
    const fd = new FormData();
    fd.append("domain", domain);
    fd.append("sourceId", sourceId);
    images.forEach((image, i) => fd.append("image", image, `frame-${i}.jpg`));
    const res = await fetch("/api/inventory", { method: "POST", body: fd });
    if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
    return (await res.json()) as Inventory;
  } finally {
    inFlight = false;
  }
}
