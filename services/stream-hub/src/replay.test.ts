import { describe, expect, it } from "vitest";
import { firstFrameTs, frameSchedule, operatorMessages } from "./replay.js";

describe("operatorMessages", () => {
  const jsonl = [
    JSON.stringify({ at: 1000, msg: { type: "source.status", source: "glasses", kind: "glasses", online: true, fps: 2 } }),
    JSON.stringify({ at: 1500, msg: { type: "nav", path: "/scan" } }),
    JSON.stringify({ at: 1200, msg: { type: "scan.start", seconds: 6 } }),
    JSON.stringify({ at: 2000, msg: { type: "check", origin: "guide", step: 1 } }),
    JSON.stringify({ at: 2500, msg: { type: "check" } }),
    JSON.stringify({ at: 2600, msg: { type: "say", text: "verified" } }),
    "not json",
    "",
  ].join("\n");

  it("keeps only operator messages, sorted and re-based to the first one", () => {
    expect(operatorMessages(jsonl)).toEqual([
      { at: 0, msg: { type: "scan.start", seconds: 6 } },
      { at: 300, msg: { type: "nav", path: "/scan" } },
      { at: 1300, msg: { type: "check" } },
    ]);
  });

  it("can be aligned to an explicit base (the first frame)", () => {
    expect(operatorMessages(jsonl, 1000).map((c) => c.at)).toEqual([200, 500, 1500]);
    expect(operatorMessages(jsonl, 5000).map((c) => c.at)).toEqual([0, 0, 0]);
  });
});

describe("frameSchedule", () => {
  it("uses recorded timestamps when every file has one", () => {
    const names = ["000002-1700000000500.jpg", "000001-1700000000000.jpg", "control.jsonl"];
    expect(frameSchedule(names)).toEqual([
      { name: "000001-1700000000000.jpg", at: 0 },
      { name: "000002-1700000000500.jpg", at: 500 },
    ]);
    expect(firstFrameTs(names)).toBe(1700000000000);
  });

  it("falls back to a fixed fps for plain folders", () => {
    expect(frameSchedule(["b.jpg", "a.png", "c.txt"], 4)).toEqual([
      { name: "a.png", at: 0 },
      { name: "b.jpg", at: 250 },
    ]);
    expect(firstFrameTs(["a.jpg"])).toBeUndefined();
  });
});
