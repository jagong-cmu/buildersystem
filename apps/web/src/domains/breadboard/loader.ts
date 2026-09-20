import type { BoardPlacement, Manual, PartInstance, Step } from "@/core/types";
import type { ManualInput } from "@/core/plugin";
import { deriveRequires } from "@/core/multiset";
import { breadboardManualSchema } from "./schema";

export function loadBreadboardManual(input: ManualInput): Manual<BoardPlacement> {
  const file = Object.keys(input.files).find((n) => /^manual\.json$/i.test(n));
  if (!file) throw new Error(`${input.dir}: no manual.json`);
  const parsed = breadboardManualSchema.safeParse(JSON.parse(input.files[file]));
  if (!parsed.success) throw new Error(`${input.dir}/manual.json: ${parsed.error.message}`);
  const m = parsed.data;

  const parts: PartInstance<BoardPlacement>[] = [
    { id: "board", partType: "bb:uno", placement: { kind: "part", pins: [] } },
    { id: "breadboard", partType: "bb:breadboard", placement: { kind: "part", pins: [] } },
    ...m.parts.map<PartInstance<BoardPlacement>>((p) => ({
      id: p.id,
      partType: p.partType,
      placement: { kind: "part", pins: p.pins, polarity: p.polarity },
    })),
    ...m.wires.map<PartInstance<BoardPlacement>>((w) => ({
      id: w.id,
      partType: "bb:jumper",
      color: w.color,
      placement: { kind: "wire", from: w.from, to: w.to },
    })),
  ];
  const byId = new Map(parts.map((p) => [p.id, p]));

  const steps: Step<BoardPlacement>[] = m.steps.map((s, i) => {
    const added = s.add.map((id) => {
      const p = byId.get(id);
      if (!p) throw new Error(`${input.dir}: step ${i + 1} references unknown id "${id}"`);
      return p;
    });
    return {
      n: i + 1,
      title: s.title ?? `Step ${i + 1}`,
      text: s.text,
      add: s.add,
      callouts: deriveRequires(added.map((p) => ({ partType: p.partType })), false),
      expected: { description: `${s.text} The components and wires are seated in the stated rows.`, probes: s.probes },
    };
  });

  return {
    id: input.id,
    domain: "breadboard",
    title: input.meta.title,
    description: input.meta.description,
    estMinutes: input.meta.estMinutes,
    thumbnail: input.meta.thumbnail ?? `/${input.dir}/thumb.png`,
    source: { kind: "json", path: `${input.dir}/${file}` },
    // Board and breadboard are required but never counted as "callouts".
    requires: deriveRequires(parts.map((p) => ({ partType: p.partType })), false),
    parts,
    steps,
  };
}
