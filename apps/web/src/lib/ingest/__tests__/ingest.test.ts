import { describe, expect, it } from "vitest";
import { mergePages } from "../parse";
import { applyMappings } from "../map-parts";
import { buildDocumentManual } from "@/core/document";
import { cropStyle } from "@/domains/document/crop";

describe("document ingestion", () => {
  it("merges pages in page and original-number order", () => {
    const steps = mergePages([
      { steps: [{ n: 2, text: "b", partsUsed: [], region: { page: 2, bbox: [0, 0, 1, 1] }, confidence: 0.8 }, { text: "c", partsUsed: [], region: { page: 2, bbox: [0, 0, 1, 1] }, confidence: 0.7 }] },
      { steps: [{ n: 1, text: "a", partsUsed: [], region: { page: 1, bbox: [0, 0, 1, 1] }, confidence: 0.9 }] },
    ]);
    expect(steps.map((step) => step.text)).toEqual(["a", "b", "c"]);
    expect(steps.map((step) => step.n)).toEqual([1, 2, 3]);
  });

  it("keeps uncertain and unknown part mappings as extras", () => {
    const vocabulary = [{ id: "lego:brick", domain: "lego" as const, name: "Brick", visionHint: "brick" }];
    const result = applyMappings("lego", ["Brick", "Mystery", "Missing"], [
      { name: "Brick", partTypeId: "lego:brick", confidence: 0.9 },
      { name: "Mystery", partTypeId: "lego:brick", confidence: 0.5 },
      { name: "Missing", partTypeId: "lego:nope", confidence: 0.9 },
    ], vocabulary);
    expect(result).toHaveLength(3);
    expect(result.map((mapping) => mapping.partTypeId)).toEqual(["lego:brick", "ext:mystery", "ext:missing"]);
  });

  it("expands quantities into placed instances and requirements", () => {
    const manual = buildDocumentManual({
      id: "demo",
      domain: "lego",
      meta: { title: "Demo", description: "", estMinutes: 1 },
      steps: [{ text: "Add bricks", partsUsed: [{ name: "brick", qty: 2 }], region: { page: 1, bbox: [0, 0, 1, 1] }, confidence: 0.8 }],
      mappings: [{ name: "brick", partTypeId: "ext:brick", confidence: 0.4 }],
    });
    expect(manual.parts).toHaveLength(2);
    expect(manual.requires).toEqual([{ partType: "ext:brick", qty: 2 }]);
    expect(manual.steps[0].add).toHaveLength(2);
  });

  it("computes crop scale and translation", () => {
    expect(cropStyle([0.25, 0.5, 0.5, 0.25], { width: 400, height: 200 }).transform).toBe("translate(-200px, -400px) scale(2, 4)");
    expect(cropStyle([0, 0, 1, 1], { width: 400, height: 200 }).transform).toBe("translate(0px, 0px) scale(1, 1)");
  });
});
