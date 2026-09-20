import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { replan } from "../replan";
import type { Inventory } from "../types";
import { loadBreadboardManual } from "@/domains/breadboard/loader";
import { BREADBOARD_SUBS } from "@/domains/breadboard/subs";
import { loadLegoManual } from "@/domains/lego/loader";
import { LEGO_SUBS } from "@/domains/lego/subs";

function inventory(domain: Inventory["domain"], items: [string, number, string?][]): Inventory {
  return {
    domain,
    items: items.map(([partType, qty, color]) => ({ partType, qty, color, conf: 1 })),
    capturedAt: "",
    sourceId: "test",
    frameSeqs: [],
  };
}

function fullInventory(manual: ReturnType<typeof legoManual>, extra: [string, number][]): Inventory;
function fullInventory(manual: ReturnType<typeof breadboardManual>, extra: [string, number][]): Inventory;
function fullInventory(manual: ReturnType<typeof legoManual> | ReturnType<typeof breadboardManual>, extra: [string, number][]): Inventory {
  const quantities = new Map<string, number>();
  for (const requirement of manual.requires) quantities.set(requirement.partType, (quantities.get(requirement.partType) ?? 0) + requirement.qty);
  for (const [partType, qty] of extra) quantities.set(partType, (quantities.get(partType) ?? 0) + qty);
  return inventory(manual.domain, [...quantities].map(([partType, qty]) => [partType, qty]));
}

function legoManual() {
  return loadLegoManual({
    id: "phone_stand",
    dir: "manuals/lego/phone_stand",
    meta: { title: "Phone stand", description: "", estMinutes: 1 },
    files: { "model.ldr": readFileSync("../../manuals/lego/phone_stand/model.ldr", "utf8") },
  });
}

function breadboardManual() {
  return loadBreadboardManual({
    id: "night_light",
    dir: "manuals/breadboard/night_light",
    meta: { title: "Night light", description: "", estMinutes: 1 },
    files: { "manual.json": readFileSync("../../manuals/breadboard/night_light/manual.json", "utf8") },
  });
}

describe("replan", () => {
  it("rewrites LEGO placements and remaining callouts", () => {
    const manual = legoManual();
    const before = structuredClone(manual);
    const result = replan(
      manual,
      fullInventory(manual, [["lego:3003", 4]]),
      1,
      [{ partType: "lego:3001", qty: 1 }],
      LEGO_SUBS,
      { colorAware: false },
    );

    expect(result.fromStep).toBe(2);
    expect(result.unresolved).toEqual([]);
    expect(result.subs[0].forStep).toBe(2);
    const step = result.manual.steps[1];
    expect(step.add).not.toContain("s2p1");
    expect(step.add).toEqual(expect.arrayContaining(["s2p1.0", "s2p1.1"]));
    const replacements = result.manual.parts.filter((part) => ["s2p1.0", "s2p1.1"].includes(part.id));
    expect(replacements.map((part) => [part.placement.ldrawPart, part.partType, part.placement.pos, part.placement.rot])).toEqual([
      ["3003", "lego:3003", [-20, -48, 0], [1, 0, 0, 0, 1, 0, 0, 0, 1]],
      ["3003", "lego:3003", [20, -48, 0], [1, 0, 0, 0, 1, 0, 0, 0, 1]],
    ]);
    expect(step.callouts).toContainEqual({ partType: "lego:3003", qty: 2, color: "red" });
    expect(step.callouts).toContainEqual({ partType: "lego:3003", qty: 2 });
    expect(step.text).toMatch(/Substitution: Two 2x2 bricks/);
    expect(manual).toEqual(before);
  });

  it("preserves completed references and untouched remaining steps", () => {
    const manual = legoManual();
    const result = replan(
      manual,
      fullInventory(manual, [["lego:3003", 4]]),
      1,
      [{ partType: "lego:3001", qty: 1 }],
      LEGO_SUBS,
      { colorAware: false },
    );

    expect(result.manual.steps[0]).toBe(manual.steps[0]);
    expect(result.manual.steps.slice(2)).toEqual(manual.steps.slice(2));
  });

  it("updates breadboard callouts without transforming placements", () => {
    const manual = breadboardManual();
    const available = fullInventory(manual, [["bb:resistor_100", 2]]);
    available.items = available.items.filter((item) => item.partType !== "bb:resistor_220");
    const result = replan(
      manual,
      available,
      2,
      [{ partType: "bb:resistor_220", qty: 1 }],
      BREADBOARD_SUBS,
      { colorAware: false },
    );

    const step = result.manual.steps.find((candidate) => candidate.add.includes("r2"));
    expect(step).toBeDefined();
    expect(step?.add).toContain("r2");
    expect(result.manual.parts.find((part) => part.id === "r2")?.partType).toBe("bb:resistor_220");
    expect(step?.callouts).not.toContainEqual({ partType: "bb:resistor_220", qty: 1 });
    expect(step?.callouts).toContainEqual({ partType: "bb:resistor_100", qty: 2 });
    expect(step?.text).toMatch(/100Ω \+ 100Ω in series/);
    expect(result.fromStep).toBe(step?.n);
    expect(result.unresolved).toEqual([]);
  });

  it("reports an unresolved remainder without changing steps", () => {
    const manual = legoManual();
    const result = replan(
      manual,
      fullInventory(manual, []),
      1,
      [{ partType: "lego:3001", qty: 3 }],
      LEGO_SUBS,
      { colorAware: false },
    );

    expect(result.unresolved).toEqual([{ partType: "lego:3001", qty: 1 }]);
    expect(result.subs).toEqual([]);
    expect(result.fromStep).toBe(2);
    expect(result.manual.steps).toEqual(manual.steps);
  });
});
