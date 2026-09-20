import { describe, expect, it } from "vitest";
import { loadLibrary } from "@/core/library";
import { matchManual } from "@/core/matcher";
import type { Inventory } from "@/core/types";
import { getPlugin } from "@/domains";
import { LEGO_PARTS } from "../vocabulary";
import { DIMS } from "../dims";
import { SET_11039, setCoverage, setInventoryItems } from "../sets";

const setInventory: Inventory = { domain: "lego", capturedAt: new Date(0).toISOString(), sourceId: "set-11039", frameSeqs: [], items: setInventoryItems(SET_11039) };

const MANUALS = [
  "creative-food-cupcake", "creative-food-sprinkle-cake",
  "creative-food-ice-cream", "creative-food-bubble-tea",
  "creative-food-avocado", "creative-food-pear",
  "creative-food-taco", "creative-food-panini",
];

describe("LEGO 11039 Creative Food Friends", () => {
  it("inventory page adds up to 150 pieces of known parts", () => {
    const ids = new Set(LEGO_PARTS.map((p) => p.id));
    expect(SET_11039.elements.reduce((n, el) => n + el.qty, 0)).toBe(SET_11039.pieces);
    expect(new Set(SET_11039.elements.map((el) => el.element)).size).toBe(SET_11039.elements.length);
    for (const el of SET_11039.elements) {
      expect(ids.has(`lego:${el.part}`), `${el.part} in vocabulary`).toBe(true);
      expect(DIMS[el.part], `${el.part} has dimensions`).toBeDefined();
    }
  });

  it("every booklet build is buildable from the set with exact colors", async () => {
    const { manuals, errors } = await loadLibrary();
    expect(errors).toEqual([]);
    const plugin = getPlugin("lego");
    for (const id of MANUALS) {
      const manual = manuals.find((m) => m.id === id);
      expect(manual, id).toBeDefined();
      expect(manual!.steps.length).toBeGreaterThanOrEqual(5);
      const result = matchManual(setInventory, manual!, plugin.substitutions, { colorAware: true });
      expect(result.status, `${id}: ${JSON.stringify(result.missing)}`).toBe("buildable");
    }
  });

  it("cupcake and taco follow the booklet step counts", async () => {
    const { manuals } = await loadLibrary();
    expect(manuals.find((m) => m.id === "creative-food-cupcake")!.steps).toHaveLength(11);
    expect(manuals.find((m) => m.id === "creative-food-ice-cream")!.steps).toHaveLength(10);
    expect(manuals.find((m) => m.id === "creative-food-avocado")!.steps).toHaveLength(15);
    expect(manuals.find((m) => m.id === "creative-food-taco")!.steps).toHaveLength(12);
  });

  it("counts how much of the set a partial scan found", () => {
    expect(setCoverage(SET_11039, setInventory.items, true)).toBe(150);
    expect(setCoverage(SET_11039, [{ partType: "lego:98138", qty: 10, conf: 1, color: "black" }], true)).toBe(4);
    expect(setCoverage(SET_11039, [{ partType: "lego:98138", qty: 10, conf: 1, color: "black" }], false)).toBe(10);
  });

  it("accepts look-alike printed tiles the scanner cannot tell apart", async () => {
    const plugin = getPlugin("lego");
    const { manuals } = await loadLibrary();
    const avocado = manuals.find((m) => m.id === "creative-food-avocado")!;
    // Swap every printed eye tile for a plain white round tile: still buildable via substitutions.
    const eyes = new Set(["lego:102576", "lego:102577", "lego:102702", "lego:102763", "lego:102764", "lego:103032"]);
    const items = setInventory.items.map((it) => (eyes.has(it.partType) ? { ...it, partType: "lego:98138" } : it));
    const m = matchManual({ ...setInventory, items }, avocado, plugin.substitutions, { colorAware: false });
    expect(m.status).toBe("with-subs");
    expect(m.missing).toEqual([]);
  });
});
