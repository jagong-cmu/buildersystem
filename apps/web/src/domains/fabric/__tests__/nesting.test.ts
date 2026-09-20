import { describe, expect, it } from "vitest";
import { nest } from "../nesting";
import { fabricFeasibility } from "..";
import { loadFabricManual } from "../loader";
import type { Inventory } from "@/core/types";

describe("nest", () => {
  const compat = (a: string, b: string) => a === b;
  it("places pieces largest-first with rotation and guillotine splits", () => {
    const r = nest(
      [
        { id: "p1", w: 200, h: 140, fabricClass: "c" },
        { id: "p2", w: 200, h: 140, fabricClass: "c" },
      ],
      [{ id: "s1", w: 300, h: 220, fabricClass: "c" }, { id: "s2", w: 150, h: 250, fabricClass: "c" }],
      compat,
    );
    expect(r.ok).toBe(true);
    expect(r.placements.map((p) => p.scrapId)).toEqual(["s1", "s2"]);
    expect(r.placements[1].rotated).toBe(true);
  });
  it("fails with a useful message when a piece does not fit", () => {
    const r = nest([{ id: "big", w: 400, h: 400, fabricClass: "c" }], [{ id: "s1", w: 300, h: 300, fabricClass: "c" }], compat);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/"big".*does not fit/);
  });
});

describe("fabricFeasibility", () => {
  const pouch = loadFabricManual({
    id: "zipper_pouch",
    dir: "manuals/fabric/zipper_pouch",
    meta: { title: "Pouch", description: "", estMinutes: 1 },
    files: {
      "manual.json": JSON.stringify({
        pieces: [
          { id: "front", polygonMm: [[0, 0], [200, 0], [200, 140], [0, 140]], fabricClass: "fab:cotton_woven", qty: 1 },
          { id: "back", polygonMm: [[0, 0], [200, 0], [200, 140], [0, 140]], fabricClass: "fab:cotton_woven", qty: 1 },
        ],
        notions: [{ partType: "fab:zipper", qty: 1, minLengthMm: 180 }],
        steps: [{ kind: "cut", pieces: ["front", "back"], text: "cut" }],
      }),
    },
  });
  const inv = (zipperMm: number, scrapClass = "fab:cotton_woven"): Inventory => ({
    domain: "fabric",
    items: [
      { partType: scrapClass, qty: 1, conf: 1, polygonMm: [[0, 0], [450, 0], [450, 150], [0, 150]] },
      { partType: "fab:zipper", qty: 1, conf: 1, attrs: { lengthMm: zipperMm } },
    ],
    capturedAt: "",
    sourceId: "t",
    frameSeqs: [],
  });
  it("accepts when both pieces nest on one scrap and the zipper is long enough", () => {
    expect(fabricFeasibility(inv(200), pouch).ok).toBe(true);
  });
  it("rejects a short zipper", () => {
    const f = fabricFeasibility(inv(150), pouch);
    expect(f.ok).toBe(false);
    expect(f.detail).toMatch(/150 mm/);
  });
  it("rejects fleece for a cotton design", () => {
    expect(fabricFeasibility(inv(200, "fab:fleece"), pouch).ok).toBe(false);
  });
});
