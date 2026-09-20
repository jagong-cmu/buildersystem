import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tallyParts } from "../tally";
import { loadBreadboardManual } from "@/domains/breadboard/loader";
import { loadFabricManual } from "@/domains/fabric/loader";
import { loadLegoManual } from "@/domains/lego/loader";

const manual = loadLegoManual({
  id: "phone_stand",
  dir: "manuals/lego/phone_stand",
  meta: { title: "Phone stand", description: "", estMinutes: 1 },
  files: { "model.ldr": readFileSync("../../manuals/lego/phone_stand/model.ldr", "utf8") },
});

describe("tallyParts", () => {
  it("starts with nothing used", () => {
    for (const t of tallyParts(manual, 0)) {
      expect(t.used).toBe(0);
      expect(t.usedThisStep).toBe(0);
      expect(t.left).toBe(t.qty);
    }
  });

  it("counts parts no step introduces (board, thread) as in use from step 1", () => {
    const blink = loadBreadboardManual({
      id: "blink",
      dir: "manuals/breadboard/blink",
      meta: { title: "Blink", description: "", estMinutes: 1 },
      files: { "manual.json": readFileSync("../../manuals/breadboard/blink/manual.json", "utf8") },
    });
    const coaster = loadFabricManual({
      id: "coaster",
      dir: "manuals/fabric/coaster",
      meta: { title: "Coaster", description: "", estMinutes: 1 },
      files: { "manual.json": readFileSync("../../manuals/fabric/coaster/manual.json", "utf8") },
    });
    for (const m of [blink, coaster]) {
      expect(tallyParts(m, 0).reduce((s, t) => s + t.left, 0)).toBe(tallyParts(m, 0).reduce((s, t) => s + t.total, 0));
      for (const t of tallyParts(m, m.steps.length)) expect(t.left).toBe(0);
    }
    const thread = tallyParts(coaster, 1).find((t) => t.partType === "fab:thread")!;
    expect(thread.usedThisStep).toBe(1);
    const cotton = tallyParts(coaster, 1).find((t) => t.partType === "fab:cotton_woven")!;
    expect(cotton).toMatchObject({ qty: 1, total: 2, used: 2, left: 0 });
  });

  it("counts down as steps place parts and reaches zero at the end", () => {
    const total = manual.steps.length;
    let prevUsed = 0;
    for (let n = 1; n <= total; n++) {
      const tally = tallyParts(manual, n);
      const used = tally.reduce((s, t) => s + t.used, 0);
      const thisStep = tally.reduce((s, t) => s + t.usedThisStep, 0);
      expect(thisStep).toBe(manual.steps[n - 1].add.length);
      expect(used - prevUsed).toBe(thisStep);
      prevUsed = used;
    }
    for (const t of tallyParts(manual, total)) {
      expect(t.used).toBe(t.qty);
      expect(t.left).toBe(0);
    }
  });

  it("never reports negative remaining", () => {
    const short = { ...manual, requires: manual.requires.map((r) => ({ ...r, qty: 1 })) };
    for (const t of tallyParts(short, manual.steps.length)) expect(t.left).toBe(0);
  });
});
