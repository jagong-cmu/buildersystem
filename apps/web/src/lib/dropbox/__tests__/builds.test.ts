import { describe, expect, it } from "vitest";
import type { AppliedSub, Manual } from "@/core/types";
import { buildRecordPath, renderReadme, writeBuildRecord, type BuildRecord } from "@/lib/dropbox/builds";

const manual = {
  id: "phone_stand",
  title: "Phone stand",
  thumbnail: "/manuals/lego/phone_stand/thumb.svg",
} as Manual;

const subs: AppliedSub[] = [{
  ruleId: "brick-pair",
  note: "Two 2x2 bricks replace one 2x4 brick",
  consumes: [{ partType: "lego:3001", qty: 1 }],
  produces: { partType: "lego:3003", qty: 2 },
  forStep: 2,
}];

const record: BuildRecord = {
  path: "/Builds/2026-01-02-phone_stand-abcdef",
  manualId: manual.id,
  title: manual.title,
  date: "2026-01-02",
  startedAt: 1,
  finishedAt: 2,
  subs,
  steps: [
    { n: 1, status: "verified", before: true, after: true, expected: true, sourceKind: "glasses" },
    { n: 2, status: "verified", before: false, after: true, expected: false },
  ],
};

describe("Dropbox build records", () => {
  it("renders title, date, steps, substitutions, and glasses evidence", () => {
    const readme = renderReadme(record);
    expect(readme).toContain("# Phone stand");
    expect(readme).toContain("Built on 2026-01-02");
    expect(readme).toContain("| Step | Status | Hint | Source | Before | After |");
    expect(readme).toContain("Two 2x2 bricks replace one 2x4 brick");
    expect(readme).toContain("Documented from the builder's point of view via Ray-Ban Meta glasses");
  });

  it("only includes the glasses line for glasses evidence", () => {
    expect(renderReadme({ ...record, steps: record.steps.map((step) => ({ ...step, sourceKind: undefined })) })).not.toContain("Ray-Ban Meta");
  });

  it("uses the required record path format", () => {
    expect(buildRecordPath(manual, new Date("2026-01-02T12:00:00Z"), "abcdef123")).toBe("/Builds/2026-01-02-phone_stand-abcdef");
  });

  it("uploads result last, retries failures, and falls back for existing links", async () => {
    const calls: string[] = [];
    const dbx = {
      filesUpload: async ({ path }: { path: string }) => {
        calls.push(path);
        if (path.endsWith("manual.json")) {
          throw Object.assign(new Error("temporary"), { status: 500 });
        }
      },
      sharingCreateSharedLinkWithSettings: async () => {
        throw Object.assign(new Error("exists"), { status: 409, error: { ".tag": "shared_link_already_exists" } });
      },
      sharingListSharedLinks: async () => ({ result: { links: [{ url: "https://dropbox.example/build" }] } }),
    };
    const result = await writeBuildRecord(dbx, record, [
      { name: "README.md", contents: "readme" },
      { name: "manual.json", contents: "{}" },
      { name: "result.json", contents: "{}" },
    ]);
    expect(calls.map((call) => call.split("/").pop())).toEqual(["README.md", "manual.json", "manual.json", "manual.json", "manual.json", "result.json"]);
    expect(result.failed).toEqual(["manual.json"]);
    expect(result.url).toBe("https://dropbox.example/build");
  });
});
