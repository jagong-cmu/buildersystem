import type { LegoPlacement, Manual, PartInstance, Requirement, Step } from "@/core/types";
import type { ManualInput } from "@/core/plugin";
import { deriveRequires } from "@/core/multiset";
import { parseLdraw, partNumber } from "./ldraw";
import { colorName, partName } from "./vocabulary";

/** Find the model file: model.ldr / model.mpd / first *.ldr|*.mpd in the manual dir. */
export function pickModelFile(files: Record<string, string>): string | undefined {
  const names = Object.keys(files);
  return (
    names.find((n) => /^model\.(ldr|mpd)$/i.test(n)) ?? names.find((n) => /\.(ldr|mpd)$/i.test(n))
  );
}

export function loadLegoManual(input: ManualInput): Manual<LegoPlacement> {
  const file = pickModelFile(input.files);
  if (!file) throw new Error(`${input.dir}: no .ldr/.mpd file`);
  const model = parseLdraw(input.files[file], input.id);
  if (model.steps.length === 0) throw new Error(`${input.dir}/${file}: no parts found`);

  const parts: PartInstance<LegoPlacement>[] = [];
  const steps: Step<LegoPlacement>[] = model.steps.map((s, i) => {
    const added: PartInstance<LegoPlacement>[] = s.refs.map((r, j) => ({
      id: `s${i + 1}p${j + 1}`,
      partType: `lego:${partNumber(r.file)}`,
      color: colorName(r.color),
      placement: { ldrawPart: partNumber(r.file), ldrawColor: r.color, pos: r.pos, rot: r.rot },
    }));
    parts.push(...added);
    const callouts = deriveRequires(added, true);
    const text = s.text ?? defaultText(callouts);
    return {
      n: i + 1,
      title: s.title ?? `Step ${i + 1}`,
      text,
      add: added.map((p) => p.id),
      callouts,
      expected: { description: `${text} The new parts are attached to the model.` },
    };
  });

  return {
    id: input.id,
    domain: "lego",
    title: input.meta.title,
    description: input.meta.description,
    estMinutes: input.meta.estMinutes,
    thumbnail: input.meta.thumbnail ?? `/${input.dir}/thumb.png`,
    source: { kind: "ldr", path: `${input.dir}/${file}` },
    requires: deriveRequires(parts, true),
    parts,
    steps,
  };
}

function defaultText(callouts: Requirement[]): string {
  const list = callouts.map((c) => `${c.qty} × ${c.color ? c.color + " " : ""}${partName(c.partType)}`);
  return `Add ${list.join(", ")}.`;
}
