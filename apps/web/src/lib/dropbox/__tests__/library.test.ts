import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSyncState, sync, type LibraryClient } from "../library";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

function file(path_lower: string, rev: string, size?: number) {
  return { ".tag": "file" as const, path_lower, path_display: path_lower, name: path_lower.split("/").pop()!, rev, ...(size === undefined ? {} : { size }) };
}

describe("Dropbox manual library sync", () => {
  it("syncs paginated files, persists a cursor, applies revisions, and removes folders", async () => {
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "library-"));
    roots.push(cacheDir);
    const downloads = new Map([
      ["/Manuals/lego/demo/meta.json", Buffer.from('{"title":"Demo","description":"","estMinutes":1}')],
      ["/Manuals/lego/demo/model.ldr", Buffer.from("model")],
    ]);
    let continuation = false;
    const client: LibraryClient = {
      async filesListFolderGetLatestCursor() {
        return { result: { cursor: "cursor-1" } };
      },
      async filesListFolder() {
        return { result: { entries: [file("/Manuals/lego/demo/meta.json", "r1")], cursor: "page-1", has_more: true } };
      },
      async filesListFolderContinue() {
        continuation = true;
        return {
          result: {
            entries: [
              file("/Manuals/lego/demo/model.ldr", "r1"),
              { ".tag": "deleted", path_lower: "/Manuals/lego/old", name: "old" },
            ],
            cursor: "page-2",
            has_more: false,
          },
        };
      },
      async filesDownload({ path: remote }) {
        return { result: { fileBinary: downloads.get(remote), rev: "r1" } };
      },
    };

    const first = await sync(client, { root: "/Manuals", cacheDir });
    expect(first.added).toHaveLength(2);
    expect(continuation).toBe(true);
    expect(await fs.readFile(path.join(cacheDir, "state.json"), "utf8")).toContain("cursor-1");
    await fs.mkdir(path.join(cacheDir, "manuals/lego/old"), { recursive: true });
    await fs.writeFile(path.join(cacheDir, "manuals/lego/old/meta.json"), "old");

    const changed = new Map(downloads);
    changed.set("/Manuals/lego/demo/model.ldr", Buffer.from("changed"));
    const secondClient: LibraryClient = {
      async filesListFolderGetLatestCursor() {
        throw new Error("must use the saved cursor");
      },
      async filesListFolder() {
        throw new Error("must use continuation");
      },
      async filesListFolderContinue({ cursor }) {
        expect(cursor).toBe("cursor-1");
        return {
          result: {
            entries: [
              file("/Manuals/lego/demo/meta.json", "r1"),
              file("/Manuals/lego/demo/model.ldr", "r2"),
              { ".tag": "deleted", path_lower: "/Manuals/lego/old", name: "old" },
            ],
            cursor: "cursor-2",
            has_more: false,
          },
        };
      },
      async filesDownload({ path: remote }) {
        return { result: { fileBinary: changed.get(remote), rev: remote.endsWith("model.ldr") ? "r2" : "r1" } };
      },
    };
    const second = await sync(secondClient, { root: "/Manuals", cacheDir });
    expect(second.changed).toEqual(["/manuals/lego/demo/model.ldr"]);
    expect(await fs.readFile(path.join(cacheDir, "manuals/lego/demo/model.ldr"), "utf8")).toBe("changed");
    await expect(fs.access(path.join(cacheDir, "manuals/lego/old"))).rejects.toThrow();
    expect((await readSyncState(cacheDir)).cursor).toBe("cursor-2");
  });

  it("reports one download failure while synchronizing the rest", async () => {
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "library-"));
    roots.push(cacheDir);
    const client: LibraryClient = {
      async filesListFolderGetLatestCursor() {
        return { result: { cursor: "cursor" } };
      },
      async filesListFolder() {
        return {
          result: {
            entries: [file("/Manuals/lego/demo/meta.json", "r1"), file("/Manuals/lego/demo/model.ldr", "r1")],
            cursor: "cursor",
            has_more: false,
          },
        };
      },
      async filesListFolderContinue() {
        throw new Error("unexpected continuation");
      },
      async filesDownload({ path: remote }) {
        if (remote.endsWith("meta.json")) throw new Error("download failed");
        return { result: { fileBinary: Buffer.from("model"), rev: "r1" } };
      },
    };
    const result = await sync(client, { root: "/Manuals", cacheDir });
    expect(result.errors).toEqual(["/manuals/lego/demo/meta.json: download failed"]);
    await expect(fs.readFile(path.join(cacheDir, "manuals/lego/demo/model.ldr"), "utf8")).resolves.toBe("model");
  });

  it("redownloads a file whose cached content is missing", async () => {
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "library-"));
    roots.push(cacheDir);
    let downloads = 0;
    const client: LibraryClient = {
      async filesListFolderGetLatestCursor() {
        return { result: { cursor: "cursor-1" } };
      },
      async filesListFolder() {
        return { result: { entries: [file("/Manuals/lego/demo/model.ldr", "r1")], cursor: "cursor-1", has_more: false } };
      },
      async filesListFolderContinue() {
        return {
          result: {
            entries: [file("/Manuals/lego/demo/model.ldr", "r1")],
            cursor: "cursor-2",
            has_more: false,
          },
        };
      },
      async filesDownload() {
        downloads += 1;
        return { result: { fileBinary: Buffer.from("model"), rev: "r1" } };
      },
    };

    await sync(client, { root: "/Manuals", cacheDir });
    await fs.rm(path.join(cacheDir, "manuals/lego/demo/model.ldr"));
    await sync(client, { root: "/Manuals", cacheDir });

    expect(downloads).toBe(2);
    await expect(fs.readFile(path.join(cacheDir, "manuals/lego/demo/model.ldr"), "utf8")).resolves.toBe("model");
  });
});
