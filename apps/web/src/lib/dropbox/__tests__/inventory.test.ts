import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { InventoryClient } from "../inventory";
import { fromPersisted, scanPhotoFolder, toPersisted } from "../inventory";
import type { Inventory } from "@/core/types";

vi.mock("@/lib/inventory-service", () => ({
  detectInventory: vi.fn(async (domain: Inventory["domain"], _images: unknown[], sourceId: string) => ({
    domain,
    items: [{ partType: "lego:3001", qty: 2, color: "red", conf: 0.9 }],
    capturedAt: "2026-01-01T00:00:00.000Z",
    sourceId,
    frameSeqs: [],
  })),
}));

describe("Dropbox inventory", () => {
  it("round-trips persisted inventory metadata", () => {
    const inventory: Inventory = {
      domain: "lego",
      items: [{ partType: "lego:3001", qty: 2, color: "red", conf: 0.9 }],
      capturedAt: "2026-01-01T00:00:00.000Z",
      sourceId: "dropbox",
      frameSeqs: [],
      dropbox: {
        sources: [{ path: "/Photos/lego/bins/a.jpg", capturedAt: "2025-12-01T00:00:00.000Z" }],
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };
    expect(fromPersisted(toPersisted(inventory))).toEqual(inventory);
  });

  it("keeps scanning after one photo fails", async () => {
    const client: InventoryClient = {
      async filesListFolder() {
        return {
          result: {
            entries: [
              { ".tag": "file", name: "bad.jpg", path_display: "/Photos/lego/bins/bad.jpg" },
              { ".tag": "file", name: "good.jpg", path_display: "/Photos/lego/bins/good.jpg", client_modified: "2026-01-02T00:00:00.000Z" },
            ],
            has_more: false,
          },
        };
      },
      async filesDownload({ path }) {
        if (path.endsWith("bad.jpg")) throw new Error("download failed");
        return { result: { fileBinary: await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).png().toBuffer() } };
      },
      async filesUpload() {},
    };
    const result = await scanPhotoFolder(client, "lego", "/Photos/lego/bins", "different-bins");
    expect(result.perPhoto.find((photo) => photo.path.endsWith("bad.jpg"))?.error).toBe("download failed");
    expect(result.merged.items).toHaveLength(1);
    expect(result.merged.dropbox?.sources).toEqual([{ path: "/Photos/lego/bins/good.jpg", capturedAt: "2026-01-02T00:00:00.000Z" }]);
  });
});
