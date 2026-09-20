import { describe, expect, it } from "vitest";
import { aggregateFrames } from "../inventory";
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
