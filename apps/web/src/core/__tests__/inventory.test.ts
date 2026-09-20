import { describe, expect, it } from "vitest";
import { aggregateFrames, mergeFrames, sumFrames } from "../inventory";
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
