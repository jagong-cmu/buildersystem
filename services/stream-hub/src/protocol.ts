// Wire format shared by every observation source and consumer (PRD §8).
// Binary message = uint32 BE header length + JSON header + JPEG bytes.

export interface FrameHeader {
  v: 1;
  sourceId: string;
  seq: number;
  ts: number; // ms epoch
  w: number;
  h: number;
  mime: "image/jpeg";
}

export type ControlMessage =
  | { type: "scan.start"; source?: string; seconds?: number }
  | { type: "scan.stop" }
  | { type: "check"; step?: number }
  | { type: "next" }
  | { type: "prev" }
  | { type: "say"; text: string }
  | { type: "part.missing"; partType: string; color?: string; qty?: number }
  | { type: "inventory.updated"; domain: string; count: number }
  | { type: "step.activated"; manualId: string; step: number; text: string }
  | { type: "verify.result"; manualId: string; step: number; status: string; hint?: string }
  | { type: "motion"; source: string; state: "active" | "settled"; score: number }
  | { type: "source.status"; source: string; kind: string; online: boolean; fps: number };

export function encodeFrame(header: FrameHeader, jpeg: Uint8Array): Uint8Array {
  const h = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(4 + h.length + jpeg.length);
  new DataView(out.buffer).setUint32(0, h.length, false);
  out.set(h, 4);
  out.set(jpeg, 4 + h.length);
  return out;
}

export function decodeFrame(buf: Uint8Array): { header: FrameHeader; jpeg: Uint8Array } {
  const len = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(0, false);
  const header = JSON.parse(new TextDecoder().decode(buf.subarray(4, 4 + len))) as FrameHeader;
  return { header, jpeg: buf.subarray(4 + len) };
}
