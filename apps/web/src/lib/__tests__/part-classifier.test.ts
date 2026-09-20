import { describe, expect, it } from "vitest";
import { BREADBOARD_PARTS } from "@/domains/breadboard/vocabulary";
import { candidatesFor, resolvePart, variantGroup } from "../part-classifier";

describe("candidatesFor", () => {
  const cands = candidatesFor(BREADBOARD_PARTS);
  it("collapses resistor values and LED colours onto one label each", () => {
    expect(cands.filter((c) => c.id.startsWith("bb:resistor")).map((c) => c.id)).toEqual(["bb:resistor"]);
    expect(cands.filter((c) => c.id.startsWith("bb:led")).map((c) => c.id)).toEqual(["bb:led", "bb:led_rgb"]);
  });
  it("uses one descriptive prompt per part", () => {
    expect(cands.find((c) => c.id === "bb:uno")?.label).toBe("a photo of an Arduino Uno microcontroller board");
    expect(new Set(cands.map((c) => c.id)).size).toBe(cands.length);
    expect(new Set(cands.map((c) => c.label)).size).toBe(cands.length);
  });
});

describe("resolvePart", () => {
  it("keeps the vision label inside a look-alike group", () => {
    expect(resolvePart("bb:resistor", "bb:resistor_220", BREADBOARD_PARTS)).toBe("bb:resistor_220");
    expect(resolvePart("bb:led", "bb:led_green", BREADBOARD_PARTS)).toBe("bb:led_green");
  });
  it("takes the classifier pick when it names a concrete part", () => {
    expect(resolvePart("bb:buzzer_active", "bb:tilt_switch", BREADBOARD_PARTS)).toBe("bb:buzzer_active");
  });
  it("falls back to the first group member when the vision label is outside the group", () => {
    expect(resolvePart("bb:resistor", "bb:diode_1n4007", BREADBOARD_PARTS)).toBe("bb:resistor_10");
  });
  it("variantGroup is the identity for ungrouped ids", () => {
    expect(variantGroup("bb:led_rgb")).toBe("bb:led_rgb");
    expect(variantGroup("bb:led_red")).toBe("bb:led");
  });
});
