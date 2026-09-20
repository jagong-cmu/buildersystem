// Server-only: LEGO part identification via Brickognize (https://brickognize.com), a public
// image-search API trained on the BrickLink catalogue. It classifies one part per image, so the
// caller localizes instances first (vision model boxes) and sends one crop per instance.
import sharp from "sharp";
import type { Box } from "@/core/inventory";

export const BRICKOGNIZE_URL = (process.env.BRICKOGNIZE_URL ?? "https://api.brickognize.com").replace(/\/$/, "");
/** BRICKOGNIZE=0 keeps the plain vision-model pipeline for LEGO. */
export const BRICKOGNIZE_ENABLED = process.env.BRICKOGNIZE !== "0";

const TIMEOUT_MS = 12_000;
const CONCURRENCY = 4;
/** Crops are padded so the classifier sees the whole part even when the box hugs it tightly. */
const CROP_PAD = 0.18;
const MIN_CROP_PX = 64;

export interface BrickognizeItem {
  id: string;
  name: string;
  score: number;
}
export interface BrickognizeColor {
  id: string;
  name: string;
  score: number;
}
export interface BrickognizeResult {
  items: BrickognizeItem[];
  colors: BrickognizeColor[];
  /** Box of the recognised part, normalized [x, y, w, h] relative to the image sent. */
  box?: Box;
}

interface RawResponse {
  bounding_box?: { left: number; upper: number; right: number; lower: number; image_width: number; image_height: number; score: number };
  items?: { id: string; name: string; score: number }[];
  colors?: { id: string; name: string; score: number }[];
}

export async function identifyPart(image: { data: Uint8Array; mediaType: string }, opts: { topK?: number } = {}): Promise<BrickognizeResult> {
  const form = new FormData();
  form.append("query_image", new Blob([image.data as BlobPart], { type: image.mediaType }), image.mediaType === "image/png" ? "part.png" : "part.jpg");
  const url = `${BRICKOGNIZE_URL}/predict/parts/?predict_color=true&top_k_items=${opts.topK ?? 5}&top_k_colors=3`;
  const res = await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Brickognize ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const raw = (await res.json()) as RawResponse;
  const bb = raw.bounding_box;
  const box: Box | undefined =
    bb && bb.image_width > 0 && bb.image_height > 0
      ? [bb.left / bb.image_width, bb.upper / bb.image_height, (bb.right - bb.left) / bb.image_width, (bb.lower - bb.upper) / bb.image_height]
      : undefined;
  return {
    items: (raw.items ?? []).map((i) => ({ id: i.id, name: i.name, score: i.score })),
    colors: (raw.colors ?? []).map((c) => ({ id: c.id, name: c.name, score: c.score })),
    box,
  };
}

/** Cut one padded instance out of a frame. Returns null when the box is degenerate. */
export async function cropBox(image: Uint8Array, box: Box): Promise<{ data: Uint8Array; mediaType: string } | null> {
  const img = sharp(Buffer.from(image)).rotate();
  const meta = await img.metadata();
  const W = meta.width ?? 0, H = meta.height ?? 0;
  if (!W || !H) return null;
  const padX = box[2] * CROP_PAD, padY = box[3] * CROP_PAD;
  const x0 = Math.max(0, Math.floor((box[0] - padX) * W));
  const y0 = Math.max(0, Math.floor((box[1] - padY) * H));
  const x1 = Math.min(W, Math.ceil((box[0] + box[2] + padX) * W));
  const y1 = Math.min(H, Math.ceil((box[1] + box[3] + padY) * H));
  const w = x1 - x0, h = y1 - y0;
  if (w < 4 || h < 4) return null;
  let out = img.extract({ left: x0, top: y0, width: w, height: h });
  if (w < MIN_CROP_PX || h < MIN_CROP_PX) out = out.resize({ width: Math.max(w, MIN_CROP_PX), height: Math.max(h, MIN_CROP_PX), fit: "inside" });
  const data = await out.jpeg({ quality: 90 }).toBuffer();
  return { data: new Uint8Array(data), mediaType: "image/jpeg" };
}

/** Run `fn` over `items` with bounded parallelism, preserving order. */
export async function mapLimit<T, R>(items: T[], fn: (t: T, i: number) => Promise<R>, limit = CONCURRENCY): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Map a Brickognize/BrickLink part id onto a vocabulary id (`lego:<ldraw number>`).
 * Handles mould variants (`3001special`, `3794b`, `3004pb123`) by falling back to the numeric stem.
 */
export function toVocabPart(id: string, vocabIds: ReadonlySet<string>): string | undefined {
  const direct = `lego:${id}`;
  if (vocabIds.has(direct)) return direct;
  const stem = /^(\d+)/.exec(id)?.[1];
  if (stem && vocabIds.has(`lego:${stem}`)) return `lego:${stem}`;
  return undefined;
}

/** BrickLink colour names -> the lowercase names used in requirements and vision output. */
const COLOR_ALIASES: Record<string, string> = {
  "light bluish gray": "light gray",
  "dark bluish gray": "dark gray",
  "light grey": "light gray",
  "dark grey": "dark gray",
  "trans clear": "trans clear",
  "trans orange": "trans orange",
  "trans black": "trans black",
  "trans light blue": "trans light blue",
  "bright light orange": "orange",
  "medium nougat": "reddish brown",
  brown: "reddish brown",
  "dark pink": "bright pink",
  "medium lavender": "purple",
  lavender: "purple",
  "dark purple": "purple",
  "olive green": "dark green",
  "yellowish green": "lime",
  "medium lime": "lime",
  "medium azure": "medium azure",
  "dark azure": "dark azure",
};

export function normalizeBrickColor(name: string): string {
  const key = name.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return COLOR_ALIASES[key] ?? key;
}
