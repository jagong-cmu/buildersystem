// Browser-side helpers for the stream hub (PRD §8).
export const HUB_WS = process.env.NEXT_PUBLIC_HUB_WS ?? "ws://localhost:8787";
export const HUB_HTTP = HUB_WS.replace(/^ws/, "http");

export interface SourceStatus {
  id: string;
  kind: string;
  online: boolean;
  fps: number;
  frames: number;
  latestSeq: number | null;
}

export async function fetchSources(): Promise<SourceStatus[]> {
  const res = await fetch(`${HUB_HTTP}/sources`, { cache: "no-store" });
  if (!res.ok) throw new Error(`hub ${res.status}`);
  return res.json();
}

/** Decode a hub frame message (uint32 header length + JSON + JPEG) into a Blob. */
export function decodeFrameMessage(buf: ArrayBuffer): { header: Record<string, unknown>; jpeg: Blob } {
  const view = new DataView(buf);
  const len = view.getUint32(0, false);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, len)));
  const jpeg = new Blob([new Uint8Array(buf, 4 + len)], { type: "image/jpeg" });
  return { header, jpeg };
}

export function encodeFrameMessage(header: Record<string, unknown>, jpeg: ArrayBuffer): ArrayBuffer {
  const h = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(4 + h.length + jpeg.byteLength);
  new DataView(out.buffer).setUint32(0, h.length, false);
  out.set(h, 4);
  out.set(new Uint8Array(jpeg), 4 + h.length);
  return out.buffer;
}

export function sendControl(msg: Record<string, unknown>) {
  return fetch(`${HUB_HTTP}/control`, { method: "POST", body: JSON.stringify(msg) }).catch(() => {});
}

export function subscribeControl(onMessage: (msg: Record<string, unknown>) => void): () => void {
  let socket: WebSocket;
  try {
    socket = new WebSocket(`${HUB_WS}/control`);
  } catch {
    return () => {};
  }
  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    try {
      const msg = JSON.parse(event.data);
      if (msg && typeof msg === "object") onMessage(msg as Record<string, unknown>);
    } catch {}
  });
  socket.addEventListener("error", () => {});
  return () => socket.close();
}
