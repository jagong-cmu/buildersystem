import { describe, expect, it } from "vitest";
import { cropBoxes, exemplarParts, missedTruth, rejectedPredictions, selectExemplars, toTruthItems, type Exemplar, type PredictedItem } from "@/core/feedback";

const img = { data: new Uint8Array([1]), mediaType: "image/jpeg" };
const pred = (partType: string, color?: string, extra: Partial<PredictedItem> = {}): PredictedItem => ({ partType, color, qty: 1, conf: 0.8, ...extra });

describe("correction bookkeeping", () => {
  it("normalizes truth rows (drops zero qty, lowercases color, sorts)", () => {
    expect(toTruthItems([{ partType: "lego:3003", qty: 0, color: "Red" }, { partType: "lego:3003", qty: 2, color: " Blue" }, { partType: "lego:3001", qty: 1 }])).toEqual([
      { partType: "lego:3001", qty: 1 },
      { partType: "lego:3003", color: "blue", qty: 2 },
    ]);
  });
  it("rejected = predicted keys the user did not keep; color matters for LEGO only", () => {
    const truth = toTruthItems([{ partType: "lego:3001", color: "red", qty: 1 }]);
    const rej = rejectedPredictions("lego", [pred("lego:3001", "red"), pred("lego:3001", "blue"), pred("lego:3003", "red")], truth);
    expect(rej.map((r) => `${r.partType}:${r.color}`)).toEqual(["lego:3001:blue", "lego:3003:red"]);
    const bb = rejectedPredictions("breadboard", [pred("bb:led_red", "red")], toTruthItems([{ partType: "bb:led_red", qty: 1 }]));
    expect(bb).toEqual([]);
  });
  it("missed = truth keys the model never proposed", () => {
    const truth = toTruthItems([{ partType: "bb:uno", qty: 1 }, { partType: "bb:breadboard", qty: 1 }]);
    expect(missedTruth("breadboard", [pred("bb:uno")], truth).map((t) => t.partType)).toEqual(["bb:breadboard"]);
  });
  it("crop boxes prefer per-instance boxes, clamp to the image and skip degenerate ones", () => {
    const clamped = cropBoxes(pred("x", undefined, { bbox: [0.1, 0.1, 0.2, 0.2], boxes: [[0.9, 0.9, 0.5, 0.5], [0.5, 0.5, 0.001, 0.2]] }));
    expect(clamped).toHaveLength(1);
    expect(clamped[0][0]).toBe(0.9);
    expect(clamped[0][2]).toBeCloseTo(0.1);
    expect(clamped[0][3]).toBeCloseTo(0.1);
    expect(cropBoxes(pred("x", undefined, { bbox: [0.1, 0.1, 0.2, 0.2] }))).toEqual([[0.1, 0.1, 0.2, 0.2]]);
    expect(cropBoxes(pred("x"))).toEqual([]);
  });
});

describe("few-shot exemplars", () => {
  const scene = (n: number): Exemplar => ({ kind: "scene", image: img, items: [{ partType: `lego:${n}`, qty: 1 }], missed: [], rejected: [] });
  const neg = (n: number): Exemplar => ({ kind: "negative", image: img, partType: `lego:${n}` });
  it("caps scenes and negatives separately, keeping order", () => {
    const all = [scene(1), neg(1), scene(2), neg(2), neg(3), scene(3)];
    const picked = selectExemplars(all, { scenes: 2, negatives: 1 });
    expect(picked.map((e) => (e.kind === "scene" ? `s${e.items[0].partType}` : `n${e.partType}`))).toEqual(["slego:1", "slego:2", "nlego:1"]);
  });
  it("renders nothing without exemplars and one text+image pair per exemplar otherwise", () => {
    expect(exemplarParts([])).toEqual([]);
    const parts = exemplarParts([
      { kind: "scene", image: img, items: [{ partType: "lego:3001", color: "red", qty: 2 }], missed: [{ partType: "lego:3003", color: "blue", qty: 1 }], rejected: [{ partType: "lego:3020" }] },
      neg(3020),
    ]);
    expect(parts.filter((p) => p.type === "image")).toHaveLength(2);
    const text = parts.filter((p) => p.type === "text").map((p) => (p.type === "text" ? p.text : "")).join("\n");
    expect(text).toContain("2 × lego:3001 (red)");
    expect(text).toContain("missed 1 × lego:3003 (blue)");
    expect(text).toContain("invented lego:3020");
    expect(text).toContain("wrongly reported as lego:3020");
    expect(parts[0].type).toBe("text");
    expect(parts.at(-1)).toMatchObject({ type: "text" });
  });
});
