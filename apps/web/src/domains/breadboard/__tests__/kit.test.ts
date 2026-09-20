import { describe, expect, it } from "vitest";
import { loadLibrary } from "@/core/library";
import { BREADBOARD_PARTS, ELEGOO_SUPER_STARTER_KIT, partOhms, resistorId } from "../vocabulary";
import { BREADBOARD_SUBS } from "../subs";

describe("ELEGOO Super Starter Kit vocabulary", () => {
  it("every kit line is a vocabulary part and ids are unique", () => {
    const ids = BREADBOARD_PARTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of ELEGOO_SUPER_STARTER_KIT) expect(ids, r.partType).toContain(r.partType);
  });

  it("encodes resistor values round-trip", () => {
    expect(resistorId(220)).toBe("bb:resistor_220");
    expect(resistorId(5100)).toBe("bb:resistor_5_1k");
    expect(resistorId(1000000)).toBe("bb:resistor_1M");
    expect(partOhms("bb:resistor_5_1k")).toBe(5100);
    expect(partOhms("bb:resistor_1M")).toBe(1000000);
    expect(partOhms("bb:led_red")).toBe(0);
  });

  it("substitution rules only reference vocabulary parts", () => {
    const ids = new Set(BREADBOARD_PARTS.map((p) => p.id));
    for (const rule of BREADBOARD_SUBS) {
      expect(ids.has(rule.produces.partType), rule.id).toBe(true);
      for (const c of rule.consumes) expect(ids.has(c.partType), rule.id).toBe(true);
    }
  });

  it("every breadboard manual is buildable from one kit", async () => {
    const { manuals, errors } = await loadLibrary();
    expect(errors).toEqual([]);
    const kit = new Map(ELEGOO_SUPER_STARTER_KIT.map((r) => [r.partType, r.qty]));
    const bb = manuals.filter((m) => m.domain === "breadboard");
    expect(bb.length).toBeGreaterThanOrEqual(9);
    for (const m of bb)
      for (const r of m.requires) {
        expect(kit.has(r.partType), `${m.id} needs ${r.partType}`).toBe(true);
        expect(r.qty, `${m.id} needs ${r.qty}× ${r.partType}`).toBeLessThanOrEqual(kit.get(r.partType)!);
      }
  });
});
