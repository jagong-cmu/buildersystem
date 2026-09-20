// Server-only: correction cases on disk at eval/vision/feedback/<domain>/<id>/ (image.jpg, scene.jpg,
// truth.json, neg-*.jpg). The eval harness scores them like curated cases; detectInventory loads the
// newest ones as few-shot exemplars.
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { DomainId } from "@/core/types";
import {
  EXEMPLAR_LIMITS,
  correctionId,
  cropBoxes,
  missedTruth,
  rejectedPredictions,
  selectExemplars,
  toTruthItems,
  type CorrectionCase,
  type CorrectionInput,
  type Exemplar,
} from "@/core/feedback";

export const FEEDBACK_ROOT =
  process.env.VISION_FEEDBACK_DIR ??
  path.resolve(process.cwd(), "../../eval/vision/feedback");

/** VISION_EXEMPLARS=0 disables few-shot injection (eval A/B, cost control). */
export const exemplarsEnabled = () => process.env.VISION_EXEMPLARS !== "0";

/** Long edge of the stored frame (matches what the model sees) and of the few-shot scene thumbnail. */
const FRAME_EDGE = 1024;
const SCENE_EDGE = 512;
const CROP_EDGE = 256;
/** Padding around a rejected box so the crop keeps some context. */
const CROP_PAD = 0.15;

const caseDir = (domain: DomainId, id: string) =>
  path.join(FEEDBACK_ROOT, domain, id);

export async function saveCorrection(
  input: CorrectionInput,
  frame: { data: Uint8Array; mediaType: string },
): Promise<CorrectionCase> {
  const id = correctionId();
  const dir = caseDir(input.domain, id);
  await mkdir(dir, { recursive: true });

  const base = sharp(Buffer.from(frame.data)).rotate();
  const full = await base
    .clone()
    .resize({
      width: FRAME_EDGE,
      height: FRAME_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
  const scene = await sharp(full)
    .resize({
      width: SCENE_EDGE,
      height: SCENE_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 75 })
    .toBuffer();
  await writeFile(path.join(dir, "image.jpg"), full);
  await writeFile(path.join(dir, "scene.jpg"), scene);

  const items = toTruthItems(input.items);
  const rejected: CorrectionCase["rejected"] = [];
  const meta = await sharp(full).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  for (const p of rejectedPredictions(input.domain, input.predicted, items)) {
    for (const [x, y, w, h] of cropBoxes(p)) {
      if (!W || !H) break;
      const px = Math.max(0, Math.floor((x - w * CROP_PAD) * W));
      const py = Math.max(0, Math.floor((y - h * CROP_PAD) * H));
      const pw = Math.min(W - px, Math.ceil(w * (1 + 2 * CROP_PAD) * W));
      const ph = Math.min(H - py, Math.ceil(h * (1 + 2 * CROP_PAD) * H));
      if (pw < 8 || ph < 8) continue;
      const file = `neg-${rejected.length}.jpg`;
      const crop = await sharp(full)
        .extract({ left: px, top: py, width: pw, height: ph })
        .resize({
          width: CROP_EDGE,
          height: CROP_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();
      await writeFile(path.join(dir, file), crop);
      rejected.push({
        partType: p.partType,
        ...(p.color ? { color: p.color } : {}),
        file,
      });
    }
  }

  const record: CorrectionCase = {
    id,
    domain: input.domain,
    at: new Date().toISOString(),
    sourceId: input.sourceId,
    source: "correction",
    items,
    predicted: input.predicted,
    rejected,
    ...(input.note ? { note: input.note } : {}),
  };
  await writeFile(
    path.join(dir, "truth.json"),
    JSON.stringify(record, null, 2),
  );
  invalidate(input.domain);
  return record;
}

export async function listCorrections(
  domain: DomainId,
): Promise<CorrectionCase[]> {
  const dir = path.join(FEEDBACK_ROOT, domain);
  let ids: string[];
  try {
    ids = (await readdir(dir)).sort().reverse();
  } catch {
    return [];
  }
  const out: CorrectionCase[] = [];
  for (const id of ids) {
    try {
      if (!(await stat(path.join(dir, id))).isDirectory()) continue;
      const rec = JSON.parse(
        await readFile(path.join(dir, id, "truth.json"), "utf8"),
      ) as CorrectionCase;
      if (rec && Array.isArray(rec.items))
        out.push({
          ...rec,
          id,
          rejected: rec.rejected ?? [],
          predicted: rec.predicted ?? [],
        });
    } catch {
      /* skip malformed case */
    }
  }
  return out;
}

export async function feedbackStats(domain: DomainId) {
  const cases = await listCorrections(domain);
  return {
    domain,
    count: cases.length,
    negatives: cases.reduce((s, c) => s + c.rejected.length, 0),
    latest: cases[0]?.at ?? null,
    dir: path.relative(path.resolve(process.cwd(), "../.."), FEEDBACK_ROOT),
  };
}

// Exemplars are cached per domain until a correction is saved (or the dir changes on disk).
const cache = new Map<DomainId, { signature: string; exemplars: Exemplar[] }>();
function invalidate(domain: DomainId) {
  cache.delete(domain);
}

async function signature(domain: DomainId): Promise<string> {
  try {
    return (await readdir(path.join(FEEDBACK_ROOT, domain))).sort().join("\n");
  } catch {
    return "";
  }
}

/**
 * Newest scenes and rejected crops for the domain, ready for `exemplarParts`. Empty when disabled or nothing saved.
 * `exclude` keeps a case out of its own context when the eval scores it.
 */
export async function loadExemplars(
  domain: DomainId,
  opts: { exclude?: string } = {},
): Promise<Exemplar[]> {
  if (!exemplarsEnabled()) return [];
  const sig =
    (await signature(domain)) + (opts.exclude ? `\n!${opts.exclude}` : "");
  if (!sig) return [];
  const hit = cache.get(domain);
  if (hit && hit.signature === sig) return hit.exemplars;

  const all: Exemplar[] = [];
  const enough = () =>
    all.filter((e) => e.kind === "scene").length >= EXEMPLAR_LIMITS.scenes &&
    all.filter((e) => e.kind === "negative").length >=
      EXEMPLAR_LIMITS.negatives;
  for (const c of await listCorrections(domain)) {
    if (enough()) break;
    if (c.id === opts.exclude) continue;
    const dir = caseDir(domain, c.id);
    try {
      const data = new Uint8Array(
        await readFile(path.join(dir, "scene.jpg")).catch(() =>
          readFile(path.join(dir, "image.jpg")),
        ),
      );
      all.push({
        kind: "scene",
        image: { data, mediaType: "image/jpeg" },
        items: c.items,
        missed: missedTruth(domain, c.predicted, c.items),
        rejected: rejectedPredictions(domain, c.predicted, c.items).map(
          (r) => ({
            partType: r.partType,
            ...(r.color ? { color: r.color } : {}),
          }),
        ),
      });
    } catch {
      /* case without image */
    }
    for (const r of c.rejected) {
      try {
        all.push({
          kind: "negative",
          image: {
            data: new Uint8Array(await readFile(path.join(dir, r.file))),
            mediaType: "image/jpeg",
          },
          partType: r.partType,
          ...(r.color ? { color: r.color } : {}),
        });
      } catch {
        /* missing crop */
      }
    }
  }
  const exemplars = selectExemplars(all, EXEMPLAR_LIMITS);
  cache.set(domain, { signature: sig, exemplars });
  return exemplars;
}
