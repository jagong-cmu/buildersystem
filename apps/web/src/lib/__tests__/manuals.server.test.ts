import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { libraryManualsDir } from "../dropbox/library";
import { getManuals, listLibrary, mergeManuals } from "../manuals.server";

const root = libraryManualsDir();

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("runtime manual library", () => {
  it("replaces matching built-ins in place and appends new manuals", () => {
    const a = { id: "a" } as never;
    const b = { id: "b" } as never;
    const replacement = { id: "a", title: "runtime" } as never;
    const c = { id: "c" } as never;
    expect(mergeManuals([a, b], [replacement, c])).toEqual([replacement, b, c]);
  });

  it("keeps valid manuals when another runtime manual has broken metadata", async () => {
    await fs.mkdir(path.join(root, "lego", "valid"), { recursive: true });
    await fs.copyFile(path.resolve(process.cwd(), "../../manuals/lego/phone_stand/meta.json"), path.join(root, "lego/valid/meta.json"));
    await fs.copyFile(path.resolve(process.cwd(), "../../manuals/lego/phone_stand/model.ldr"), path.join(root, "lego/valid/model.ldr"));
    await fs.mkdir(path.join(root, "lego", "broken"), { recursive: true });
    await fs.writeFile(path.join(root, "lego/broken/meta.json"), "{invalid");
    await fs.writeFile(path.join(root, "lego/broken/model.ldr"), "0 STEP\n");

    const entries = await listLibrary();
    const valid = entries.find((entry) => entry.id === "valid");
    const broken = entries.find((entry) => entry.id === "broken");
    expect(valid?.status).toBe("ok");
    expect(valid?.manual?.id).toBe("valid");
    expect(broken?.status).toBe("error");
    expect(broken?.error).toMatch(/Unexpected token|JSON/);
    expect((await getManuals()).some((manual) => manual.id === "valid")).toBe(true);
  });
});
