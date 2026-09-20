import { describe, expect, it } from "vitest";
import { decodeFrame, encodeFrame } from "./protocol.js";
import { FrameRing } from "./ring.js";
import { diffScore } from "./motion.js";

describe("frame protocol", () => {
  it("round-trips header and payload", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const header = { v: 1 as const, sourceId: "glasses", seq: 7, ts: 123, w: 640, h: 480, mime: "image/jpeg" as const };
    const { header: h, jpeg: j } = decodeFrame(encodeFrame(header, jpeg));
    expect(h).toEqual(header);
    expect([...j]).toEqual([...jpeg]);
  });
});

describe("FrameRing", () => {
  it("keeps the newest N frames and finds by seq/ts", () => {
    const r = new FrameRing(3);
    for (let i = 1; i <= 5; i++) r.push({ header: { v: 1, sourceId: "s", seq: i, ts: i * 100, w: 1, h: 1, mime: "image/jpeg" }, jpeg: new Uint8Array([i]) });
    expect(r.all().map((f) => f.header.seq)).toEqual([3, 4, 5]);
    expect(r.latest()?.header.seq).toBe(5);
    expect(r.bySeq(4)?.jpeg[0]).toBe(4);
    expect(r.at(450)?.header.seq).toBe(4);
    expect(r.range(300, 400).map((f) => f.header.seq)).toEqual([3, 4]);
  });
});

describe("diffScore", () => {
  it("is zero for identical thumbnails and scales with change", () => {
    const a = new Uint8Array(1024).fill(10);
    const b = new Uint8Array(1024).fill(30);
    expect(diffScore(a, a)).toBe(0);
    expect(diffScore(a, b)).toBe(20);
  });
});
