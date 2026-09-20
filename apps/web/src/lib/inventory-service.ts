import { getPlugin } from "@/domains";
import type { DomainPlugin } from "@/core/plugin";
import type { DomainId, Inventory, InventoryItem } from "@/core/types";
import { inventoryPrompt, inventorySchema, makeInventory } from "@/core/inventory";
import { VISION_MOCK, imageHash, visionObject } from "@/lib/vision";

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
  const out = await visionObject({
    schema: inventorySchema(plugin),
    system: inventoryPrompt(plugin),
    text: text ?? "Identify the parts on the table.",
    images,
  });
  return makeInventory(domain, out.items, sourceId);
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
