import { describe, expect, it } from "vitest";
import { ObjectionWindow, matchCallout, mockEstimate, proposalPhrase, shouldPropose, wherePhrase } from "../hands-free";
import type { Detection } from "../detections";

const det = (partType: string, bbox: [number, number, number, number], extra: Partial<Detection> = {}): Detection => ({
  partType,
  qty: 1,
  conf: 0.9,
  seq: 1,
  at: 0,
  misses: 0,
  bbox,
  ...extra,
});

describe("state estimation proposal", () => {
  it("proposes only confident estimates strictly inside 2..N", () => {
    expect(shouldPropose({ step: 4, conf: 0.8 }, 6)).toBe(true);
    expect(shouldPropose({ step: 1, conf: 0.9 }, 6)).toBe(false);
    expect(shouldPropose({ step: 7, conf: 0.9 }, 6)).toBe(false);
    expect(shouldPropose({ step: 0, conf: 0.1 }, 6)).toBe(false);
    expect(shouldPropose({ step: 3, conf: 0.4 }, 6)).toBe(false);
    expect(shouldPropose(null, 6)).toBe(false);
  });

  it("speaks the step and the objection window", () => {
    expect(proposalPhrase(4)).toMatch(/step 4/);
    expect(proposalPhrase(4)).toMatch(/5 seconds/);
  });

  it("mock estimate is deterministic and in range", () => {
    expect(mockEstimate(7, 5)).toEqual(mockEstimate(7, 5));
    for (let s = 0; s < 20; s++) {
      const e = mockEstimate(s, 5);
      expect(e.step).toBeGreaterThanOrEqual(2);
      expect(e.step).toBeLessThanOrEqual(5);
    }
    expect(mockEstimate(3, 1).step).toBe(1);
  });
});

describe("ObjectionWindow", () => {
  it("accepts after the window elapses with no objection", () => {
    const w = ObjectionWindow.open(4, 1000, 5);
    expect(w.secondsLeft(1000)).toBe(5);
    expect(w.tick(3000)).toBe("pending");
    expect(w.secondsLeft(3500)).toBe(3);
    expect(w.tick(6000)).toBe("accept");
    expect(w.tick(9000)).toBe("pending"); // settled: never fires twice
  });

  it("rejects when the wearer objects inside the window", () => {
    const w = ObjectionWindow.open(4, 1000, 5);
    w.object();
    expect(w.tick(2000)).toBe("reject");
    expect(w.tick(9000)).toBe("reject");
  });
});

describe("where is it", () => {
  const label = "blue Plate 1x4";
  it("speaks the location of the latest bbox", () => {
    expect(wherePhrase(label, [det("plate", [0.05, 0.8, 0.1, 0.1])], { partType: "plate" })).toBe(`${label}: bottom left of your view.`);
    expect(wherePhrase(label, [det("plate", [0.45, 0.45, 0.1, 0.1])], { partType: "plate" })).toBe(`${label}: right in front of you.`);
  });

  it("falls back when the part is not in view or stale", () => {
    expect(wherePhrase(label, [], { partType: "plate" })).toMatch(/not in view/);
    expect(wherePhrase(label, [det("plate", [0, 0, 0.1, 0.1], { misses: 2 })], { partType: "plate" })).toMatch(/not in view/);
    expect(wherePhrase(label, [det("plate", [0, 0, 0.1, 0.1], { color: "red" })], { partType: "plate", color: "blue" })).toMatch(/not in view/);
  });

  it("matches callouts by type, label words, or color", () => {
    const callouts = [
      { partType: "3710", qty: 2, color: "blue" },
      { partType: "3005", qty: 1, color: "red" },
    ];
    const labelOf = (c: { partType: string; color?: string }) => (c.partType === "3710" ? `${c.color} Plate 1x4` : `${c.color} Brick 1x1`);
    expect(matchCallout(callouts, labelOf)).toHaveLength(2);
    expect(matchCallout(callouts, labelOf, "3005")).toEqual([callouts[1]]);
    expect(matchCallout(callouts, labelOf, "plate 1x4")).toEqual([callouts[0]]);
    expect(matchCallout(callouts, labelOf, "1x4 plate")).toEqual([callouts[0]]);
    expect(matchCallout(callouts, labelOf, undefined, "red")).toEqual([callouts[1]]);
    expect(matchCallout(callouts, labelOf, "wheel")).toEqual([]);
  });
});
