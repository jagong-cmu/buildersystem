import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadLibrary } from "@/core/library";
import { matchManual } from "@/core/matcher";
import type { Inventory, Manual } from "@/core/types";
import { getPlugin } from "@/domains";
import { MANUALS } from "@/lib/manuals";

const repoRoot = path.resolve(process.cwd(), "../..");
const seedRoot = path.join(repoRoot, "seed", "dropbox", "Manuals");

function inventoryFor(manual: Manual): Inventory {
  return {
    domain: manual.domain,
    capturedAt: new Date(0).toISOString(),
    sourceId: "seed-test",
    frameSeqs: [],
    items: manual.requires.map((requirement) => ({
      partType: requirement.partType,
      qty: requirement.qty,
      ...(requirement.color ? { color: requirement.color } : {}),
      conf: 1,
    })),
  };
}

describe("Dropbox seed manuals", () => {
  it("loads every seeded manual and proves exact/missing inventory matching", async () => {
    const seeded = await loadLibrary(seedRoot);
    expect(seeded.errors).toEqual([]);
    expect(seeded.manuals).toHaveLength(15);

    const all = [...MANUALS, ...seeded.manuals];
    expect(new Set(all.map((manual) => manual.id)).size).toBe(all.length);
    for (const manual of seeded.manuals) {
      const plugin = getPlugin(manual.domain);
      const vocabulary = new Set(plugin.vocabulary.map((part) => part.id));
      for (const part of manual.parts) expect(vocabulary.has(part.partType)).toBe(true);

      const exact = matchManual(inventoryFor(manual), manual, plugin.substitutions, { colorAware: true });
      expect(exact.status).toBe("buildable");

      const removed = inventoryFor(manual);
      const first = removed.items[0];
      if (first) first.qty--;
      removed.items = removed.items.filter((item) => item.qty > 0);
      const short = matchManual(removed, manual, plugin.substitutions, { colorAware: true });
      expect(["missing", "with-subs"]).toContain(short.status);
    }
  });

  it("keeps every seeded part type inside the domain vocabularies", async () => {
    const { manuals, errors } = await loadLibrary(seedRoot);
    expect(errors).toEqual([]);
    for (const manual of manuals) {
      const ids = new Set(getPlugin(manual.domain).vocabulary.map((part) => part.id));
      expect(manual.requires.every((requirement) => ids.has(requirement.partType))).toBe(true);
    }
  });
});
