// Client for saving scan corrections (/api/feedback).
import type { DomainId, InventoryItem } from "@/core/types";

export interface FeedbackStats {
  domain: DomainId;
  count: number;
  negatives: number;
  latest: string | null;
  dir: string;
}

export async function fetchFeedbackStats(
  domain: DomainId,
): Promise<FeedbackStats> {
  const res = await fetch(`/api/feedback?domain=${domain}`);
  if (!res.ok)
    throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
  return (await res.json()) as FeedbackStats;
}

export async function postCorrection(opts: {
  domain: DomainId;
  sourceId: string;
  frame: Blob;
  items: InventoryItem[];
  predicted: InventoryItem[];
  note?: string;
}) {
  const fd = new FormData();
  fd.append("domain", opts.domain);
  fd.append("sourceId", opts.sourceId);
  fd.append("image", opts.frame, "frame.jpg");
  fd.append(
    "correction",
    JSON.stringify({
      items: opts.items.map(({ partType, color, qty }) => ({
        partType,
        color,
        qty,
      })),
      predicted: opts.predicted.map(
        ({ partType, color, qty, conf, bbox, boxes }) => ({
          partType,
          color,
          qty,
          conf,
          bbox,
          boxes,
        }),
      ),
      note: opts.note,
    }),
  );
  const res = await fetch("/api/feedback", { method: "POST", body: fd });
  if (!res.ok)
    throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
  return (await res.json()) as {
    saved: { id: string; items: number; rejected: number };
    stats: FeedbackStats;
  };
}
