// Server-only: electronic part identification with an off-the-shelf zero-shot image model (CLIP)
// served by the Hugging Face Inference API. The caller localizes instances first (vision model
// boxes) and sends one crop per instance; candidate labels come from the domain vocabulary.
import type { PartType } from "@/core/types";

export const PART_CLASSIFIER_MODEL = process.env.PART_CLASSIFIER_MODEL ?? "openai/clip-vit-large-patch14";
export const PART_CLASSIFIER_URL = (process.env.PART_CLASSIFIER_URL ?? "https://router.huggingface.co/hf-inference/models").replace(/\/$/, "");
/** PART_CLASSIFIER=0 keeps the plain vision-model pipeline; the classifier also needs HF_TOKEN. */
export const PART_CLASSIFIER_ENABLED = process.env.PART_CLASSIFIER !== "0" && !!process.env.HF_TOKEN;

const TIMEOUT_MS = 15_000;

export interface Candidate {
  id: string;
  label: string;
}
export interface ClassifierHit {
  id: string;
  score: number;
}

interface RawScore {
  label: string;
  score: number;
}

/** Score `candidates` against one crop; returns hits sorted by score desc (softmax over the labels). */
export async function classifyCrop(image: { data: Uint8Array; mediaType: string }, candidates: Candidate[]): Promise<ClassifierHit[]> {
  const res = await fetch(`${PART_CLASSIFIER_URL}/${PART_CLASSIFIER_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.HF_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: Buffer.from(image.data).toString("base64"), parameters: { candidate_labels: candidates.map((c) => c.label) } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Part classifier ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const raw = (await res.json()) as RawScore[];
  const byLabel = new Map(candidates.map((c) => [c.label, c.id]));
  return raw
    .flatMap((r) => {
      const id = byLabel.get(r.label);
      return id ? [{ id, score: r.score }] : [];
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Zero-shot candidates for a vocabulary. Visually indistinguishable variants (resistor values,
 * which differ only by colour bands) collapse onto one label so the classifier is not asked to
 * split its probability mass between look-alikes; the caller keeps the vision model's variant.
 */
export function candidatesFor(vocab: readonly PartType[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const p of vocab) {
    const group = variantGroup(p.id);
    if (seen.has(group)) continue;
    seen.add(group);
    const name = group === p.id ? p.name : groupName(group);
    out.push({ id: group, label: `a photo of a ${name.replace(/\s*\(.*\)$/, "").toLowerCase()}` });
  }
  return out;
}

const VARIANT_GROUPS: [RegExp, string][] = [[/^bb:resistor_/, "bb:resistor"]];

/** Vocabulary id -> the label group it is classified under (itself when it has no look-alikes). */
export function variantGroup(id: string): string {
  for (const [re, group] of VARIANT_GROUPS) if (re.test(id)) return group;
  return id;
}

function groupName(group: string): string {
  return group === "bb:resistor" ? "axial resistor with colour bands" : group;
}

/**
 * Pick the vocabulary id for a crop given the classifier's top hit and the vision model's label.
 * Inside a look-alike group the vision label wins when it belongs to the same group (it read the
 * bands); otherwise the first vocabulary member of the group is used.
 */
export function resolvePart(hitGroup: string, visionId: string, vocab: readonly PartType[]): string {
  if (variantGroup(visionId) === hitGroup) return visionId;
  if (vocab.some((p) => p.id === hitGroup)) return hitGroup;
  return vocab.find((p) => variantGroup(p.id) === hitGroup)?.id ?? visionId;
}
