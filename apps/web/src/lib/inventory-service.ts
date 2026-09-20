import { getPlugin } from "@/domains";
import type { DomainPlugin } from "@/core/plugin";
import type { DomainId, Inventory, InventoryItem } from "@/core/types";
import sharp from "sharp";
import { SANITIZE_BY_DOMAIN, inventoryPrompt, inventorySchema, itemsFromOutput, makeInventory, sanitizeItems, type Box, type SanitizeOptions } from "@/core/inventory";
import { VISION_MOCK, imageHash, visionModel, visionObject } from "@/lib/vision";
import { BRICKOGNIZE_ENABLED, cropBox, identifyPart, mapLimit, normalizeBrickColor, toVocabPart } from "@/lib/brickognize";
import { exemplarParts, type VisionPart } from "@/core/feedback";
import { loadExemplars } from "@/lib/feedback";

/** Long edge sent to the vision model; larger frames only add upload time and latency. */
const MAX_EDGE = 1024;

/** Downscale and re-encode a frame for vision (EXIF orientation applied). Normalized boxes are unaffected. */
export async function prepareImage(img: InventoryImage): Promise<InventoryImage> {
  try {
    const data = await sharp(Buffer.from(img.data)).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 80 }).toBuffer();
    return { data: new Uint8Array(data), mediaType: "image/jpeg" };
  } catch {
    return img;
  }
}

export interface InventoryImage {
  data: Uint8Array;
  mediaType: string;
}

const MOCK_COLORS = ["red", "blue", "yellow", "white", "black", "green"];

export async function detectInventory(
  domain: DomainId,
  images: InventoryImage[],
  sourceId: string,
  text?: string,
): Promise<Inventory> {
  const plugin = getPlugin(domain);
  if (VISION_MOCK) return makeInventory(domain, mockItems(plugin, imageHash(images)), sourceId);
  const [prepared, exemplars] = await Promise.all([Promise.all(images.map(prepareImage)), loadExemplars(domain).catch(() => [])]);
  const prefix = exemplarParts(exemplars);
  if (domain === "lego" && BRICKOGNIZE_ENABLED) return makeInventory(domain, await detectLegoItems(plugin, prepared, prefix, text), sourceId);
  const out = await visionObject({
    schema: inventorySchema(plugin),
    system: inventoryPrompt(plugin),
    prefix,
    text: text ?? "Identify the parts on the table.",
    images: prepared,
    fast: true,
  });
  return makeInventory(domain, itemsFromOutput(out, SANITIZE_BY_DOMAIN[domain]), sourceId);
}

/** Brickognize scores are cosine-style retrieval scores: a correct top hit is typically 0.6–0.9. */
const MIN_PART_SCORE = 0.45;
const MIN_COLOR_SCORE = 0.3;
/** A confident Brickognize hit outside the vocabulary means the vision model mislabelled the crop. */
const FOREIGN_PART_SCORE = 0.6;
const LEGO_SANITIZE: SanitizeOptions = { minConf: MIN_PART_SCORE, requireBoxes: true };

/**
 * LEGO: the vision model only localizes instances (one box each); every crop is then classified by
 * Brickognize, which decides the part number and colour. Without a vision provider the whole frame
 * is sent as a single part. Rows fall back to the vision label when Brickognize is unreachable.
 */
async function detectLegoItems(plugin: DomainPlugin, images: InventoryImage[], prefix: VisionPart[], text?: string): Promise<InventoryItem[]> {
  const vocabIds = new Set(plugin.vocabulary.map((p) => p.id));
  if (!visionModel()) {
    // A close-up of one piece legitimately fills the frame, so skip the box-size plausibility check here.
    const rows = await Promise.all(images.map((img) => identifyWholeFrame(img, vocabIds)));
    return regroup(rows.flat()).filter((r) => r.conf >= MIN_PART_SCORE);
  }
  const out = await visionObject({
    schema: inventorySchema(plugin),
    system: inventoryPrompt(plugin),
    prefix,
    text: text ?? "Identify the parts on the table.",
    images,
    fast: true,
  });
  const located = itemsFromOutput(out, SANITIZE_BY_DOMAIN.lego);
  if (images.length !== 1) return located;
  const instances = located.flatMap((it) => (it.boxes ?? []).map((box) => ({ it, box })));
  const rows = await mapLimit(instances, async ({ it, box }): Promise<InventoryItem | null> => {
    const fallback: InventoryItem = { partType: it.partType, qty: 1, ...(it.color ? { color: it.color } : {}), conf: it.conf, bbox: box, boxes: [box] };
    try {
      const crop = await cropBox(images[0].data, box);
      if (!crop) return fallback;
      const res = await identifyPart(crop);
      const hit = res.items.find((i) => toVocabPart(i.id, vocabIds));
      const top = res.items[0];
      if (!hit || hit.score < MIN_PART_SCORE) return top && top.score >= FOREIGN_PART_SCORE ? null : fallback;
      const color = res.colors[0] && res.colors[0].score >= MIN_COLOR_SCORE ? normalizeBrickColor(res.colors[0].name) : it.color;
      return { partType: toVocabPart(hit.id, vocabIds)!, qty: 1, ...(color ? { color } : {}), conf: hit.score, bbox: box, boxes: [box] };
    } catch (e) {
      console.warn("brickognize failed, keeping vision label:", (e as Error).message);
      return fallback;
    }
  });
  return sanitizeItems(regroup(rows.filter((r): r is InventoryItem => r !== null)), LEGO_SANITIZE);
}

async function identifyWholeFrame(img: InventoryImage, vocabIds: ReadonlySet<string>): Promise<InventoryItem[]> {
  const res = await identifyPart(img);
  const hit = res.items.find((i) => toVocabPart(i.id, vocabIds));
  if (!hit || hit.score < MIN_PART_SCORE || !res.box) return [];
  const color = res.colors[0] && res.colors[0].score >= MIN_COLOR_SCORE ? normalizeBrickColor(res.colors[0].name) : undefined;
  return [{ partType: toVocabPart(hit.id, vocabIds)!, qty: 1, ...(color ? { color } : {}), conf: hit.score, bbox: res.box, boxes: [res.box] }];
}

/** Merge single-instance rows into one row per part type + colour (qty = instances, conf = mean). */
function regroup(rows: InventoryItem[]): InventoryItem[] {
  const groups = new Map<string, { row: InventoryItem; boxes: Box[]; confSum: number }>();
  for (const r of rows) {
    const k = `${r.partType}|${r.color ?? ""}`;
    const g = groups.get(k);
    const boxes = r.boxes ?? (r.bbox ? [r.bbox] : []);
    if (!g) groups.set(k, { row: r, boxes: [...boxes], confSum: r.conf });
    else {
      g.boxes.push(...boxes);
      g.confSum += r.conf;
    }
  }
  return [...groups.values()].map(({ row, boxes, confSum }) => {
    const n = boxes.length || 1;
    return { partType: row.partType, qty: n, ...(row.color ? { color: row.color } : {}), conf: confSum / n, ...(boxes.length ? { bbox: boxes[0], boxes } : {}) };
  });
}

function mockItems(plugin: DomainPlugin, seed: number): InventoryItem[] {
  const vocab = plugin.vocabulary;
  const n = 3 + (seed % 3);
  const items: InventoryItem[] = [];
  for (let i = 0; i < n; i++) {
    const s = (seed >>> (i * 4)) ^ (seed * (i + 1));
    const part = vocab[(s >>> 3) % vocab.length];
    const cx = 0.12 + ((s >>> 7) % 76) / 100;
    const cy = 0.12 + ((s >>> 13) % 76) / 100;
    const qty = 1 + ((s >>> 19) % 4);
    const boxes = Array.from({ length: qty }, (_, k): [number, number, number, number] => {
      const dx = ((k % 2) * 2 - 1) * 0.09 * Math.ceil(k / 2);
      const dy = (k > 1 ? 1 : 0) * 0.14;
      return [Math.min(0.84, Math.max(0, cx - 0.08 + dx)), Math.min(0.88, Math.max(0, cy - 0.06 + dy)), 0.16, 0.12];
    });
    items.push({
      partType: part.id,
      qty,
      ...(plugin.id === "lego" ? { color: MOCK_COLORS[(s >>> 23) % MOCK_COLORS.length] } : {}),
      conf: 0.7 + ((s >>> 27) % 30) / 100,
      bbox: boxes[0],
      boxes,
    });
  }
  return items;
}
