// Minimal LDraw (.ldr/.mpd) parser: type-1 part references + STEP markers,
// with MPD submodels flattened into the parent's step. PRD §10.1.
//
// Conventions: 1 LDU = 0.4 mm; stud pitch 20; brick height 24; plate 8; -Y is up.
// A part's origin is its top plane, body extends +Y (down).

export type Mat3 = [number, number, number, number, number, number, number, number, number];
export type Vec3 = [number, number, number];

export interface LdrawRef {
  color: number;
  pos: Vec3;
  rot: Mat3;
  file: string; // as written, e.g. "3001.dat" or "sub.ldr"
}

export interface LdrawStep {
  refs: LdrawRef[];
  /** From `0 !RC TITLE ...` / `0 !RC TEXT ...` meta lines inside the step. */
  title?: string;
  text?: string;
}

export interface LdrawModel {
  name: string;
  steps: LdrawStep[];
}

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mulMat(a: Mat3, b: Mat3): Mat3 {
  const r: number[] = new Array(9).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r as Mat3;
}

export function mulVec(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function addVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** Split an MPD into named sections; a plain .ldr becomes one section named "main". */
function splitMpd(src: string): Map<string, string[]> {
  const files = new Map<string, string[]>();
  let current = "main";
  let lines: string[] = [];
  for (const raw of src.split(/\r?\n/)) {
    const m = raw.match(/^0\s+FILE\s+(.+)$/i);
    if (m) {
      if (lines.length) files.set(current, lines);
      current = m[1].trim().toLowerCase();
      lines = [];
      continue;
    }
    if (/^0\s+NOFILE/i.test(raw)) continue;
    lines.push(raw);
  }
  if (lines.length) files.set(current, lines);
  if (files.size > 1 && files.has("main") && files.get("main")!.every((l) => !l.trim())) files.delete("main");
  return files;
}

function parseSection(lines: string[]): LdrawStep[] {
  const steps: LdrawStep[] = [];
  let cur: LdrawStep = { refs: [] };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    const type = parts[0];
    if (type === "0") {
      const meta = parts.slice(1).join(" ");
      if (/^(STEP|ROTSTEP)\b/i.test(meta)) {
        steps.push(cur);
        cur = { refs: [] };
      } else if (/^!RC\s+TITLE\s+/i.test(meta)) {
        cur.title = meta.replace(/^!RC\s+TITLE\s+/i, "");
      } else if (/^!RC\s+TEXT\s+/i.test(meta)) {
        cur.text = meta.replace(/^!RC\s+TEXT\s+/i, "");
      }
      continue;
    }
    if (type === "1" && parts.length >= 15) {
      const n = parts.slice(1, 14).map(Number);
      if (n.some((x) => Number.isNaN(x))) continue;
      cur.refs.push({
        color: n[0],
        pos: [n[1], n[2], n[3]],
        rot: [n[4], n[5], n[6], n[7], n[8], n[9], n[10], n[11], n[12]],
        file: parts.slice(14).join(" "),
      });
    }
  }
  if (cur.refs.length || cur.title || cur.text) steps.push(cur);
  return steps;
}

/**
 * Parse an .ldr/.mpd. Submodel references are flattened into the step where
 * the submodel is placed; part references ("*.dat") are kept.
 */
export function parseLdraw(src: string, name = "model"): LdrawModel {
  const sections = splitMpd(src);
  const mainKey = sections.has("main") ? "main" : [...sections.keys()][0];
  const parsed = new Map<string, LdrawStep[]>();
  for (const [k, lines] of sections) parsed.set(k, parseSection(lines));

  const expand = (steps: LdrawStep[], pos: Vec3, rot: Mat3, depth: number): LdrawStep[] =>
    steps.map((s) => ({
      ...s,
      refs: s.refs.flatMap((r) => {
        const key = r.file.toLowerCase();
        const sub = parsed.get(key);
        if (sub && depth < 8) {
          const subPos = addVec(pos, mulVec(rot, r.pos));
          const subRot = mulMat(rot, r.rot);
          // Flatten: every step of the submodel collapses into this step.
          return expand(sub, subPos, subRot, depth + 1).flatMap((x) => x.refs);
        }
        return [{ ...r, pos: addVec(pos, mulVec(rot, r.pos)), rot: mulMat(rot, r.rot) }];
      }),
    }));

  const steps = expand(parsed.get(mainKey) ?? [], [0, 0, 0], IDENTITY, 0).filter(
    (s) => s.refs.length > 0 || s.title || s.text,
  );
  return { name, steps };
}

/** "3001.dat" -> "3001" */
export function partNumber(file: string): string {
  return file.replace(/\.dat$/i, "").toLowerCase();
}

/** Serialize a flat model back to .ldr (used for Studio round-trips and tests). */
export function toLdr(model: LdrawModel): string {
  const out: string[] = [`0 ${model.name}`];
  model.steps.forEach((s, i) => {
    if (s.title) out.push(`0 !RC TITLE ${s.title}`);
    if (s.text) out.push(`0 !RC TEXT ${s.text}`);
    for (const r of s.refs) out.push(`1 ${r.color} ${r.pos.join(" ")} ${r.rot.join(" ")} ${r.file}`);
    if (i < model.steps.length - 1) out.push("0 STEP");
  });
  return out.join("\n") + "\n";
}
