import { getPlugin } from "@/domains";
import type { DomainPlugin } from "@/core/plugin";
import type { DomainId, Inventory, InventoryItem } from "@/core/types";
import sharp from "sharp";
import { SANITIZE_BY_DOMAIN, inventoryPrompt, inventorySchema, itemsFromOutput, makeInventory } from "@/core/inventory";
import { VISION_MOCK, imageHash, visionObject } from "@/lib/vision";
import { exemplarParts } from "@/core/feedback";
import { loadExemplars } from "@/lib/feedback";

/** Long edge sent to the vision model; larger frames only add upload time and latency. */
const MAX_EDGE = 1024;

/** Downscale and re-encode a frame for vision (EXIF orientation applied). Normalized boxes are unaffected. */
export async function prepareImage(img: InventoryImage): Promise<InventoryImage> {
  try {
    const data = await sharp(Buffer.from(img.data)).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
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
  const out = await visionObject({
    schema: inventorySchema(plugin),
    system: inventoryPrompt(plugin),
    prefix: exemplarParts(exemplars),
    text: text ?? "Identify the parts on the table.",
    images: prepared,
    fast: true,
  });
  return makeInventory(domain, itemsFromOutput(out, SANITIZE_BY_DOMAIN[domain]), sourceId);
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
