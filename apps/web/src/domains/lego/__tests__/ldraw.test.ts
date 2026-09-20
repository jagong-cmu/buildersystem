import { describe, expect, it } from "vitest";
import { parseLdraw, toLdr } from "../ldraw";
import { loadLegoManual } from "../loader";

const SIMPLE = `0 Test
0 !RC TITLE Base
1 4 -40 -24 0 1 0 0 0 1 0 0 0 1 3001.dat
1 4 40 -24 0 1 0 0 0 1 0 0 0 1 3001.dat
0 STEP
1 1 0 -48 0 1 0 0 0 1 0 0 0 1 3003.dat
0 STEP
`;

const MPD = `0 FILE main.ldr
1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat
0 STEP
1 16 100 -24 0 0 0 1 0 1 0 -1 0 0 sub.ldr
0 FILE sub.ldr
1 1 10 0 0 1 0 0 0 1 0 0 0 1 3003.dat
0 STEP
1 1 30 0 0 1 0 0 0 1 0 0 0 1 3003.dat
`;

describe("parseLdraw", () => {
  it("splits steps on STEP and ignores a trailing empty step", () => {
    const m = parseLdraw(SIMPLE);
    expect(m.steps).toHaveLength(2);
    expect(m.steps[0].refs).toHaveLength(2);
    expect(m.steps[0].title).toBe("Base");
    expect(m.steps[1].refs[0].file).toBe("3003.dat");
    expect(m.steps[1].refs[0].pos).toEqual([0, -48, 0]);
  });

  it("flattens MPD submodels into the placing step with composed transforms", () => {
    const m = parseLdraw(MPD);
    expect(m.steps).toHaveLength(2);
    expect(m.steps[1].refs).toHaveLength(2);
    // Submodel rotated 90° about Y: local +X maps to world -Z.
    const [a, b] = m.steps[1].refs;
    expect(a.pos[0]).toBeCloseTo(100);
    expect(a.pos[2]).toBeCloseTo(-10);
    expect(b.pos[2]).toBeCloseTo(-30);
    expect(a.color).toBe(1);
  });

  it("round-trips through toLdr", () => {
    const m = parseLdraw(SIMPLE);
    const again = parseLdraw(toLdr(m));
    expect(again.steps.map((s) => s.refs.length)).toEqual([2, 1]);
  });
});

describe("loadLegoManual", () => {
  it("derives requirements and callouts from the file", () => {
    const manual = loadLegoManual({
      id: "t",
      dir: "manuals/lego/t",
      meta: { title: "T", description: "", estMinutes: 1 },
      files: { "model.ldr": SIMPLE },
    });
    expect(manual.requires).toEqual([
      { partType: "lego:3001", color: "red", qty: 2 },
      { partType: "lego:3003", color: "blue", qty: 1 },
    ]);
    expect(manual.steps[0].callouts).toEqual([{ partType: "lego:3001", color: "red", qty: 2 }]);
    expect(manual.steps[0].title).toBe("Base");
    expect(manual.steps[1].text).toMatch(/1 × blue Brick 2x2/);
  });
});
