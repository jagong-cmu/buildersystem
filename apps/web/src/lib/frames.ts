// Latest-frame access for scan capture.
import { HUB_HTTP } from "@/lib/hub";

export async function fetchLatestFrame(sourceId: string): Promise<{ blob: Blob; seq: number } | null> {
  const res = await fetch(`${HUB_HTTP}/frames/latest?source=${encodeURIComponent(sourceId)}`, { cache: "no-store" });
  if (!res.ok) return null;
  return { blob: await res.blob(), seq: Number(res.headers.get("x-seq")) };
}

export async function snapBurst(sourceId: string, count = 3, gapMs = 700): Promise<Blob[]> {
  const blobs: Blob[] = [];
  let lastSeq: number | undefined;
  for (let i = 0; i < count; i++) {
    if (i) await new Promise((resolve) => setTimeout(resolve, gapMs));
    const frame = await fetchLatestFrame(sourceId);
    if (frame && frame.seq !== lastSeq) {
      blobs.push(frame.blob);
      lastSeq = frame.seq;
    }
  }
  return blobs;
}
