import { describe, expect, it } from "vitest";
import { loadLibrary } from "@/core/library";
import { matchManual } from "@/core/matcher";
import type { Inventory } from "@/core/types";
import { getPlugin } from "@/domains";
import { LEGO_PARTS } from "../vocabulary";
import { DIMS } from "../dims";
import { SET_60486, setCoverage, setInventoryItems } from "../sets";

const setInventory: Inventory = { domain: "lego", capturedAt: new Date(0).toISOString(), sourceId: "set-60486", frameSeqs: [], items: setInventoryItems(SET_60486) };

describe("LEGO 60486 Red Sports Car", () => {
  it("inventory page adds up to 109 pieces of known parts", () => {
    const ids = new Set(LEGO_PARTS.map((p) => p.id));
    expect(SET_60486.elements.reduce((n, el) => n + el.qty, 0)).toBe(SET_60486.pieces);
    expect(new Set(SET_60486.elements.map((el) => el.element)).size).toBe(SET_60486.elements.length);
    for (const el of SET_60486.elements) {
      expect(ids.has(`lego:${el.part}`), `${el.part} in vocabulary`).toBe(true);
      expect(DIMS[el.part], `${el.part} has dimensions`).toBeDefined();
    }
  });

  it("the car uses every piece in the box exactly once", async () => {
    const { manuals, errors } = await loadLibrary();
    expect(errors).toEqual([]);
    const manual = manuals.find((m) => m.id === "city-sports-car");
    expect(manual).toBeDefined();
    expect(manual!.steps.length).toBeGreaterThanOrEqual(30);
    const result = matchManual(setInventory, manual!, getPlugin("lego").substitutions, { colorAware: true });
    expect(result.status, JSON.stringify(result.missing)).toBe("buildable");
    expect(manual!.parts).toHaveLength(SET_60486.pieces);
  });

  it("counts how much of the set a partial scan found", () => {
    expect(setCoverage(SET_60486, setInventory.items, true)).toBe(109);
    expect(setCoverage(SET_60486, [{ partType: "lego:72206", qty: 6, conf: 1, color: "black" }], true)).toBe(4);
  });
});
