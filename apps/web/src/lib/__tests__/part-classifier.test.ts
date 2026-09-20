import { describe, expect, it } from "vitest";
import { BREADBOARD_PARTS } from "@/domains/breadboard/vocabulary";
import { candidatesFor, resolvePart, variantGroup } from "../part-classifier";

describe("candidatesFor", () => {
  const cands = candidatesFor(BREADBOARD_PARTS);
  it("collapses resistor values onto one label", () => {
    expect(cands.filter((c) => c.id.startsWith("bb:resistor")).map((c) => c.id)).toEqual(["bb:resistor"]);
  });
  it("keeps one prompt-style label per remaining part, without parenthetical suffixes", () => {
    const led = cands.find((c) => c.id === "bb:led_red");
    expect(led?.label).toBe("a photo of a led");
    expect(cands.find((c) => c.id === "bb:uno")?.label).toBe("a photo of a arduino uno");
    expect(new Set(cands.map((c) => c.id)).size).toBe(cands.length);
  });
});

describe("resolvePart", () => {
  it("keeps the vision label inside a look-alike group", () => {
    expect(resolvePart("bb:resistor", "bb:resistor_220", BREADBOARD_PARTS)).toBe("bb:resistor_220");
  });
  it("takes the classifier pick when it names a concrete part", () => {
    expect(resolvePart("bb:buzzer_active", "bb:tilt_switch", BREADBOARD_PARTS)).toBe("bb:buzzer_active");
  });
  it("falls back to the first group member when the vision label is outside the group", () => {
    expect(resolvePart("bb:resistor", "bb:diode_1n4007", BREADBOARD_PARTS)).toBe("bb:resistor_10");
  });
  it("variantGroup is the identity for ungrouped ids", () => {
    expect(variantGroup("bb:led_red")).toBe("bb:led_red");
  });
});
