import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadLibrary } from "../library";

describe("document library loading", () => {
  it("loads ingested documents with derived requirements", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "document-library-"));
    await fs.mkdir(path.join(root, "lego", "fixture"), { recursive: true });
    await fs.writeFile(path.join(root, "lego", "fixture", "ingested.json"), JSON.stringify({
      id: "fixture",
      domain: "lego",
      meta: { title: "Fixture", description: "", estMinutes: 1 },
      steps: [{ text: "Add", partsUsed: [{ name: "bolt", qty: 2 }], region: { page: 1, bbox: [0, 0, 1, 1] }, confidence: 0.9 }],
      mappings: [{ name: "bolt", partTypeId: "ext:bolt", confidence: 0.4 }],
    }));
    const result = await loadLibrary(root);
    expect(result.errors).toEqual([]);
    expect(result.manuals[0].render).toBe("document");
    expect(result.manuals[0].requires).toEqual([{ partType: "ext:bolt", qty: 2 }]);
    await fs.rm(root, { recursive: true, force: true });
  });
});
