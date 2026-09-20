import { describe, expect, it } from "vitest";
import { matchManual, rankManuals } from "../matcher";
import type { Inventory, Manual } from "../types";
import { LEGO_SUBS } from "@/domains/lego/subs";
import { BREADBOARD_SUBS } from "@/domains/breadboard/subs";

function inv(domain: Inventory["domain"], items: [string, number, string?][]): Inventory {
  return {
    domain,
    items: items.map(([partType, qty, color]) => ({ partType, qty, color, conf: 1 })),
    capturedAt: "",
    sourceId: "test",
    frameSeqs: [],
  };
}

function manual(id: string, domain: Manual["domain"], requires: Manual["requires"]): Manual {
  return { id, domain, title: id, description: "", estMinutes: 1, thumbnail: "", source: { kind: "json", path: "" }, requires, parts: [], steps: [] };
}

describe("matchManual", () => {
  const stand = manual("stand", "lego", [
    { partType: "lego:3001", qty: 3, color: "red" },
    { partType: "lego:3003", qty: 2, color: "red" },
  ]);

  it("is buildable when inventory covers requirements", () => {
    const m = matchManual(inv("lego", [["lego:3001", 4, "red"], ["lego:3003", 2, "red"]]), stand, LEGO_SUBS, { colorAware: true });
    expect(m.status).toBe("buildable");
    expect(m.utilization).toBeCloseTo(5 / 6);
  });

  it("color-agnostic matching lets a blue brick stand in for red", () => {
    const i = inv("lego", [["lego:3001", 3, "blue"], ["lego:3003", 2, "red"]]);
    expect(matchManual(i, stand, LEGO_SUBS, { colorAware: true }).status).toBe("missing");
    expect(matchManual(i, stand, LEGO_SUBS, { colorAware: false }).status).toBe("buildable");
  });

  it("substitutes two 2x2 for a missing 2x4 and scales quantities", () => {
    const i = inv("lego", [["lego:3001", 1], ["lego:3003", 6]]);
    const m = matchManual(i, stand, LEGO_SUBS, { colorAware: false });
    expect(m.status).toBe("with-subs");
    expect(m.subs).toHaveLength(1);
    expect(m.subs[0].consumes).toEqual([{ partType: "lego:3003", qty: 4 }]);
    expect(m.subs[0].produces).toEqual({ partType: "lego:3001", qty: 2 });
    expect(m.penalty).toBe(2);
  });

  it("reports what is still missing when substitutions run out", () => {
    const i = inv("lego", [["lego:3001", 1], ["lego:3003", 4]]);
    const m = matchManual(i, stand, LEGO_SUBS, { colorAware: false });
    expect(m.status).toBe("missing");
    // 2 × 2x2 go to the manual, 2 spare -> one 2x4 substitute; 1 × 2x4 still missing.
    expect(m.subs[0].produces).toEqual({ partType: "lego:3001", qty: 1 });
    expect(m.missing).toEqual([{ partType: "lego:3001", qty: 1 }]);
  });

  it("breadboard: two 100Ω in series replace a 220Ω", () => {
    const light = manual("night", "breadboard", [
      { partType: "bb:resistor_220", qty: 1 },
      { partType: "bb:led_red", qty: 1 },
    ]);
    const m = matchManual(inv("breadboard", [["bb:resistor_100", 2], ["bb:led_red", 1]]), light, BREADBOARD_SUBS, { colorAware: false });
    expect(m.status).toBe("with-subs");
    expect(m.subs[0].note).toMatch(/100Ω \+ 100Ω in series/);
  });

  it("breadboard: a green LED substitutes for red", () => {
    const light = manual("blink", "breadboard", [{ partType: "bb:led_red", qty: 1 }]);
    const m = matchManual(inv("breadboard", [["bb:led_green", 1]]), light, BREADBOARD_SUBS, { colorAware: false });
    expect(m.status).toBe("with-subs");
    expect(m.subs[0].ruleId).toBe("bb:led:green-for-red");
  });
});

describe("rankManuals", () => {
  it("orders buildable → with-subs → missing, by utilization then fewest missing", () => {
    const a = manual("a", "lego", [{ partType: "lego:3001", qty: 2 }]);
    const b = manual("b", "lego", [{ partType: "lego:3001", qty: 4 }]);
    const c = manual("c", "lego", [{ partType: "lego:3001", qty: 5 }, { partType: "lego:3010", qty: 4 }]);
    const d = manual("d", "lego", [{ partType: "lego:3001", qty: 4 }, { partType: "lego:3034", qty: 1 }]);
    const i = inv("lego", [["lego:3001", 4], ["lego:3003", 2]]);
    const ranked = rankManuals(i, [c, a, d, b], LEGO_SUBS, { colorAware: false });
    expect(ranked.map((r) => `${r.manualId}:${r.status}`)).toEqual([
      "b:buildable",
      "a:buildable",
      "d:missing",
      "c:missing",
    ]);
  });
});
