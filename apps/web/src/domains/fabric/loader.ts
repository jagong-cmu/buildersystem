import type { FabricPlacement, Manual, PartInstance, Requirement, Step } from "@/core/types";
import type { ManualInput } from "@/core/plugin";
import { fabricManualSchema } from "./schema";
import { fabPartName } from "./vocabulary";

export function loadFabricManual(input: ManualInput): Manual<FabricPlacement> {
  const file = Object.keys(input.files).find((n) => /^manual\.json$/i.test(n));
  if (!file) throw new Error(`${input.dir}: no manual.json`);
  const parsed = fabricManualSchema.safeParse(JSON.parse(input.files[file]));
  if (!parsed.success) throw new Error(`${input.dir}/manual.json: ${parsed.error.message}`);
  const m = parsed.data;

  const parts: PartInstance<FabricPlacement>[] = [];
  for (const p of m.pieces)
    for (let k = 0; k < p.qty; k++)
      parts.push({
        id: p.qty > 1 ? `${p.id}_${k + 1}` : p.id,
        partType: p.fabricClass,
        placement: { kind: "piece", polygonMm: p.polygonMm, fabricClass: p.fabricClass },
      });
  for (const n of m.notions)
    for (let k = 0; k < n.qty; k++)
      parts.push({
        id: `${n.partType.replace("fab:", "")}${n.qty > 1 ? `_${k + 1}` : ""}`,
        partType: n.partType,
        placement: { kind: "notion", minLengthMm: n.minLengthMm },
      });

  const pieceIds = (ids: string[] | undefined) =>
    (ids ?? []).flatMap((id) => parts.filter((p) => p.id === id || p.id.startsWith(`${id}_`)).map((p) => p.id));

  const steps: Step<FabricPlacement>[] = m.steps.map((s, i) => {
    const add =
      s.kind === "cut"
        ? pieceIds(s.pieces)
        : s.notion
          ? parts.filter((p) => p.partType === s.notion).map((p) => p.id)
          : [];
    const callouts: Requirement[] = [];
    if (s.kind === "cut" && s.pieces) {
      const classes = new Map<string, number>();
      for (const id of pieceIds(s.pieces)) {
        const p = parts.find((x) => x.id === id)!;
        classes.set(p.partType, (classes.get(p.partType) ?? 0) + 1);
      }
      for (const [partType, qty] of classes) callouts.push({ partType, qty });
    }
    if (s.notion) callouts.push({ partType: s.notion, qty: 1 });
    return {
      n: i + 1,
      title: s.title ?? `${s.kind[0].toUpperCase()}${s.kind.slice(1)}`,
      text: s.text,
      add,
      callouts,
      expected: { description: `${s.text}` },
      meta: { kind: s.kind, pieces: s.pieces ? pieceIds(s.pieces) : undefined, seam: s.seam, notion: s.notion },
    };
  });

  // Fabric requirement is "at least one scrap of a compatible class"; the real
  // check is the nesting feasibility (see plugin.feasibility).
  const requires: Requirement[] = [
    ...[...new Set(m.pieces.map((p) => p.fabricClass))].map((partType) => ({ partType, qty: 1 })),
    ...m.notions.map((n) => ({ partType: n.partType, qty: n.qty })),
  ];

  return {
    id: input.id,
    domain: "fabric",
    title: input.meta.title,
    description: input.meta.description,
    estMinutes: input.meta.estMinutes,
    thumbnail: input.meta.thumbnail ?? `/${input.dir}/thumb.png`,
    source: { kind: "json", path: `${input.dir}/${file}` },
    requires,
    parts,
    steps,
  };
}

export function describeRequirement(r: Requirement): string {
  return `${r.qty} × ${fabPartName(r.partType)}`;
}
