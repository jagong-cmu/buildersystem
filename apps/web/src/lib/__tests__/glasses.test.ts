import { describe, expect, it } from "vitest";
import type { InventoryItem } from "@/core/types";
import type { SourceStatus } from "@/lib/hub";
import { pickPrimarySource, glassesSource, frameAgeSeconds } from "@/lib/sources";
import { FrameWindow, RateLimiter, changedKeys, coverageHint, locationPhrase, mergeWithPins } from "@/lib/live-inventory";
import { bboxToRect, containRect } from "@/lib/overlay-geometry";
import { AutoVerify } from "@/lib/auto-verify";

const src = (id: string, kind: string, online: boolean): SourceStatus => ({ id, kind, online, fps: online ? 5 : 0, frames: 0, latestSeq: null });
const item = (partType: string, qty: number, color?: string, bbox?: [number, number, number, number]): InventoryItem => ({ partType, qty, color, conf: 0.9, bbox });

describe("usePrimarySource preference order", () => {
  it("prefers online glasses over online phone and others", () => {
    const s = [src("cam", "unoq", true), src("phone", "phone", true), src("glasses", "glasses", true)];
    expect(pickPrimarySource(s)?.id).toBe("glasses");
  });
  it("falls back to phone when the glasses are offline", () => {
    expect(pickPrimarySource([src("glasses", "glasses", false), src("phone", "phone", true)])?.id).toBe("phone");
  });
  it("falls back to any online source, then offline glasses, then null", () => {
    expect(pickPrimarySource([src("glasses", "glasses", false), src("cam", "unoq", true)])?.id).toBe("cam");
    expect(pickPrimarySource([src("phone", "phone", false), src("glasses", "glasses", false)])?.id).toBe("glasses");
    expect(pickPrimarySource([])).toBeNull();
  });
  it("finds the glasses source and frame age", () => {
    const g = { ...src("glasses", "glasses", true), latestTs: 10_000 };
    expect(glassesSource([src("phone", "phone", true), g])?.id).toBe("glasses");
    expect(frameAgeSeconds(g, 12_500)).toBe(2.5);
    expect(frameAgeSeconds(src("phone", "phone", true))).toBeNull();
  });
});

describe("live inventory window", () => {
  it("aggregates max-not-sum over the last 8 frames only", () => {
    const w = new FrameWindow(8);
    w.push(1, [item("lego:3001", 9, "red")]);
    for (let i = 2; i <= 9; i++) w.push(i, [item("lego:3001", 2, "red"), item("lego:3004", i, "blue")]);
    expect(w.length).toBe(8);
    expect(w.seqs()[0]).toBe(2);
    const agg = w.aggregate();
    expect(agg.find((x) => x.partType === "lego:3001")?.qty).toBe(2); // frame 1 (qty 9) fell out of the window
    expect(agg.find((x) => x.partType === "lego:3004")?.qty).toBe(9);
  });
  it("keeps hand-edited rows pinned", () => {
    const current = [item("lego:3001", 5, "red"), item("lego:3004", 1, "blue")];
    const pinned = new Set(["lego:3001|red"]);
    const merged = mergeWithPins([item("lego:3001", 2, "red"), item("lego:3005", 3, "white")], current, pinned);
    expect(merged.find((x) => x.partType === "lego:3001")?.qty).toBe(5);
    expect(merged.find((x) => x.partType === "lego:3005")?.qty).toBe(3);
    expect(merged.find((x) => x.partType === "lego:3004")).toBeUndefined(); // unpinned rows follow the feed
  });
  it("detects which keys a hand edit changed", () => {
    expect(changedKeys([item("a", 1)], [item("a", 2), item("b", 1)]).sort()).toEqual(["a|", "b|"]);
    expect(changedKeys([item("a", 1)], [item("a", 1)])).toEqual([]);
  });
  it("caps vision calls per minute", () => {
    const r = new RateLimiter(3);
    expect([r.allow(0), r.allow(1), r.allow(2), r.allow(3)]).toEqual([true, true, true, false]);
    expect(r.allow(60_001)).toBe(true);
  });
  it("describes locations and coverage", () => {
    expect(locationPhrase([0.05, 0.8, 0.1, 0.1])).toBe("bottom left");
    expect(locationPhrase([0.45, 0.45, 0.1, 0.1])).toBe("center");
    expect(coverageHint([item("a", 1, undefined, [0.8, 0.4, 0.1, 0.1]), item("b", 1, undefined, [0.85, 0.5, 0.1, 0.1])])).toBe("look further right");
    expect(coverageHint([item("a", 1, undefined, [0.45, 0.45, 0.1, 0.1]), item("b", 1, undefined, [0.5, 0.5, 0.1, 0.1])])).toBeNull();
    expect(coverageHint([item("a", 1)])).toBeNull();
  });
});

describe("bbox → display rect", () => {
  it("letterboxes a 4:3 frame in a 16:9 box", () => {
    const r = containRect(960, 720, 1600, 900);
    expect(r).toEqual({ x: 200, y: 0, w: 1200, h: 900 });
    expect(bboxToRect([0.5, 0.5, 0.25, 0.25], r)).toEqual({ x: 800, y: 450, w: 300, h: 225 });
  });
  it("pillarboxes a wide frame in a tall box and clamps boxes", () => {
    const r = containRect(1600, 900, 800, 800);
    expect(r).toEqual({ x: 0, y: 175, w: 800, h: 450 });
    const b = bboxToRect([0.9, -0.1, 0.5, 0.5], r);
    expect(b.x).toBeCloseTo(720);
    expect(b.y).toBeCloseTo(175);
    expect(b.w).toBeCloseTo(80);
    expect(b.h).toBeCloseTo(180);
  });
});

describe("auto-verify state machine", () => {
  it("fires on active → settled while a step is armed, once per 10 s per step", () => {
    const av = new AutoVerify({ minIntervalMs: 10_000 });
    av.setStep(2);
    expect(av.onMotion("settled", 0)).toBeNull(); // no preceding activity
    expect(av.onMotion("active", 1000)).toBeNull();
    expect(av.onMotion("settled", 2000)).toBe(2);
    expect(av.onMotion("active", 3000)).toBeNull();
    expect(av.onMotion("settled", 4000)).toBeNull(); // debounced
    expect(av.onMotion("active", 12_500)).toBeNull();
    expect(av.onMotion("settled", 13_000)).toBe(2);
  });
  it("resets pending activity when the step changes and is independent per step", () => {
    const av = new AutoVerify({ minIntervalMs: 10_000 });
    av.setStep(1);
    av.onMotion("active", 0);
    av.setStep(2);
    expect(av.onMotion("settled", 100)).toBeNull();
    av.onMotion("active", 200);
    expect(av.onMotion("settled", 300)).toBe(2);
    av.setStep(3);
    av.onMotion("active", 400);
    expect(av.onMotion("settled", 500)).toBe(3);
  });
  it("never runs while disabled, while a check is in flight, or on the intro card", () => {
    const av = new AutoVerify({ enabled: false });
    av.setStep(1);
    av.onMotion("active", 0);
    expect(av.onMotion("settled", 1)).toBeNull();
    av.enabled = true;
    av.setChecking(true);
    av.onMotion("active", 2);
    expect(av.onMotion("settled", 3)).toBeNull();
    av.setChecking(false);
    av.setStep(0);
    av.onMotion("active", 4);
    expect(av.onMotion("settled", 5)).toBeNull();
  });
});
