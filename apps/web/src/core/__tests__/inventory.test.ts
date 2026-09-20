import { describe, expect, it } from "vitest";
import { aggregateFrames, fromBox2d, mergeFrames, sanitizeItems, sumFrames } from "../inventory";
import type { InventoryItem } from "../types";

const item = (partType: string, qty: number, conf: number, color?: string, bbox?: [number, number, number, number]): InventoryItem => ({
  partType,
  qty,
  conf,
  color,
  bbox,
});

describe("aggregateFrames", () => {
  it("takes the maximum quantity", () => {
    expect(aggregateFrames([[item("A", 2, 0.8)], [item("A", 5, 0.6)]])).toEqual([item("A", 5, 0.7)]);
  });

  it("averages confidence", () => {
    expect(aggregateFrames([[item("A", 2, 0.2)], [item("A", 2, 0.8)]])[0].conf).toBeCloseTo(0.5);
  });

  it("takes metadata from the latest frame", () => {
    expect(aggregateFrames([[item("A", 2, 0.8, undefined, [1, 1, 2, 2])], [item("A", 1, 0.6, undefined, [3, 3, 4, 4])]])).toEqual([
      item("A", 2, 0.7, undefined, [3, 3, 4, 4]),
    ]);
  });

  it("carries per-instance boxes from the latest frame", () => {
    const a: InventoryItem = { ...item("A", 2, 0.8), boxes: [[0, 0, 0.1, 0.1], [0.5, 0.5, 0.1, 0.1]] };
    const b: InventoryItem = { ...item("A", 1, 0.6), boxes: [[0.2, 0.2, 0.1, 0.1]] };
    expect(aggregateFrames([[a], [b]])[0].boxes).toEqual([[0.2, 0.2, 0.1, 0.1]]);
    expect(aggregateFrames([[a], [item("A", 1, 0.6)]])[0].boxes).toBeUndefined();
  });

  it("keeps colors separate", () => {
    expect(aggregateFrames([[item("A", 1, 1, "red"), item("A", 2, 1, "blue")]])).toEqual([
      item("A", 1, 1, "red"),
      item("A", 2, 1, "blue"),
    ]);
  });

  it("returns an empty list for empty input", () => {
    expect(aggregateFrames([])).toEqual([]);
  });
});

describe("Dropbox inventory aggregation", () => {
  it("sums different bins while aggregateFrames takes the maximum", () => {
    const frames = [[item("A", 2, 0.8, undefined, [1, 1, 2, 2])], [item("A", 5, 0.6, undefined, [3, 3, 4, 4])]];
    expect(sumFrames(frames)).toEqual([item("A", 7, 0.7, undefined, [3, 3, 4, 4])]);
    expect(mergeFrames(frames, "same-pile")).toEqual(aggregateFrames(frames));
    expect(mergeFrames(frames, "different-bins")).toEqual(sumFrames(frames));
  });
});

describe("makeInventory", () => {
  it("collapses duplicate part/color rows from a single vision response", async () => {
    const { makeInventory } = await import("../inventory");
    const inv = makeInventory("lego", [item("lego:3001", 2, 0.8, "red"), item("lego:3001", 3, 0.6, "red"), item("lego:3001", 1, 0.9, "blue")], "glasses");
    expect(inv.items.map((it) => `${it.partType}|${it.color}`)).toEqual(["lego:3001|red", "lego:3001|blue"]);
    expect(inv.items[0].qty).toBe(3);
  });
});

describe("fromBox2d", () => {
  it("converts [ymin, xmin, ymax, xmax] 0..1000 to normalized [x, y, w, h]", () => {
    const [x, y, w, h] = fromBox2d([100, 200, 300, 600]);
    expect([x, y, w, h].map((v) => Math.round(v * 1000))).toEqual([200, 100, 400, 200]);
  });
  it("clamps and reorders swapped corners", () => {
    expect(fromBox2d([1200, 500, -50, 250])).toEqual([0.25, 0, 0.25, 1]);
  });
});

describe("sanitizeItems", () => {
  it("drops low-confidence rows", () => {
    expect(sanitizeItems([item("A", 1, 0.2)])).toEqual([]);
  });
  it("drops implausible boxes and trims boxes to qty", () => {
    const [out] = sanitizeItems([{ ...item("A", 1, 0.9), boxes: [[0, 0, 0.9, 0.9], [0.1, 0.1, 0.05, 0.05], [0.5, 0.5, 0.05, 0.05]] }]);
    expect(out.boxes).toEqual([[0.1, 0.1, 0.05, 0.05]]);
    expect(out.bbox).toEqual([0.1, 0.1, 0.05, 0.05]);
  });
  it("removes bbox when no box is plausible", () => {
    const [out] = sanitizeItems([item("A", 1, 0.9, "red", [0, 0, 1, 1])]);
    expect(out.bbox).toBeUndefined();
    expect(out.qty).toBe(1);
  });
});
