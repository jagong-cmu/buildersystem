import type { DomainPlugin, Feasibility } from "@/core/plugin";
import type { FabricPlacement, Inventory, Manual, Requirement, SubstitutionRule } from "@/core/types";
import { loadFabricManual } from "./loader";
import { bbox, nest } from "./nesting";
import { FABRIC_COMPAT, FABRIC_PARTS, fabPartName } from "./vocabulary";

export const FABRIC_SUBS: SubstitutionRule<FabricPlacement>[] = [
  {
    id: "fab:canvas-for-cotton",
    domain: "fabric",
    consumes: [{ partType: "fab:canvas", qty: 1 }],
    produces: { partType: "fab:cotton_woven", qty: 1 },
    penalty: 0.5,
    note: "Canvas works in place of cotton; use a heavier needle.",
  },
  {
    id: "fab:denim-for-cotton",
    domain: "fabric",
    consumes: [{ partType: "fab:denim", qty: 1 }],
    produces: { partType: "fab:cotton_woven", qty: 1 },
    penalty: 0.5,
    note: "Denim works in place of cotton; use a denim needle and a longer stitch.",
  },
];

export function fabricFeasibility(inv: Inventory, m: Manual<FabricPlacement>): Feasibility {
  const scraps = inv.items
    .filter((it) => it.polygonMm && it.polygonMm.length >= 3)
    .map((it, i) => ({ id: `scrap${i + 1}`, fabricClass: it.partType, ...bbox(it.polygonMm!) }));
  if (scraps.length === 0) return { ok: false, detail: "No measured fabric scraps in the inventory." };

  const pieces = m.parts
    .filter((p) => p.placement.kind === "piece")
    .map((p) => {
      const pl = p.placement as Extract<FabricPlacement, { kind: "piece" }>;
      return { id: p.id, fabricClass: pl.fabricClass, ...bbox(pl.polygonMm) };
    });

  const result = nest(pieces, scraps, (req, have) => (FABRIC_COMPAT[req] ?? [req]).includes(have));
  if (!result.ok) return result;

  // Notion length checks (e.g. zipper must be at least the opening width).
  for (const p of m.parts) {
    if (p.placement.kind !== "notion" || !p.placement.minLengthMm) continue;
    const have = inv.items.find((it) => it.partType === p.partType);
    const len = have?.attrs?.lengthMm;
    if (typeof len === "number" && len < p.placement.minLengthMm)
      return {
        ok: false,
        detail: `${fabPartName(p.partType)} is ${len} mm; this design needs at least ${p.placement.minLengthMm} mm.`,
      };
  }
  return { ok: true, detail: result.detail, assignment: result.placements };
}

export const fabricPlugin: DomainPlugin<FabricPlacement> = {
  id: "fabric",
  vocabulary: FABRIC_PARTS,
  loadManual: loadFabricManual,
  substitutions: FABRIC_SUBS,
  feasibility: fabricFeasibility,
  commerce(missing: Requirement[]) {
    return missing.map((m) => ({
      label: `Joann: ${fabPartName(m.partType)}`,
      url: `https://www.joann.com/search?q=${encodeURIComponent(fabPartName(m.partType))}`,
    }));
  },
};
