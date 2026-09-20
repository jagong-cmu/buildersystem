// Inventory service (PRD §9): vocabulary-constrained structured output + video aggregation.
import { z } from "zod";
import type { DomainPlugin } from "./plugin";
import type { DomainId, Inventory, InventoryItem } from "./types";

export function inventorySchema(plugin: DomainPlugin) {
  const ids = plugin.vocabulary.map((p) => p.id) as [string, ...string[]];
  const item = z.object({
    partType: z.enum(ids),
    qty: z.number().int().min(1).max(200),
    color: z.string().optional().describe("Dominant color name, lowercase, only when meaningful (LEGO)."),
    conf: z.number().min(0).max(1),
    bbox: z
      .array(z.number())
      .length(4)
      .transform((value) => value as [number, number, number, number])
      .optional()
      .describe("Normalized [x, y, w, h] of one representative instance, 0..1."),
    boxes: z
      .array(z.array(z.number()).length(4).transform((value) => value as [number, number, number, number]))
      .optional()
      .describe("Normalized [x, y, w, h] for EVERY visible instance of this part, 0..1; length should equal qty."),
    polygonMm: z
      .array(z.array(z.number()).length(2).transform((value) => value as [number, number]))
      .optional()
      .describe("Fabric only: outline of the scrap in millimetres, using the marker mat for scale."),
    attrs: z.record(z.string(), z.union([z.number(), z.string()])).optional().describe("e.g. { lengthMm: 180 } for a zipper"),
  });
  return z.object({ items: z.array(item) });
}

export function inventoryPrompt(plugin: DomainPlugin): string {
  const vocab = plugin.vocabulary.map((p) => `- ${p.id}: ${p.name} — ${p.visionHint}`).join("\n");
  const domainNotes: Record<DomainId, string> = {
    lego: [
      "Count each brick type per color. Report color names in lowercase (red, blue, yellow, white, black, green, lime, dark green, dark blue, medium blue, dark red, brown, pink, purple, sand green, light gray, dark gray, tan, orange). Use the closest listed name; never invent compound names.",
      "Brick vs plate: look at the side wall. A brick's side is about three times as tall as a stud; a plate's side is barely taller than its studs. A 2x2 piece with a low side is 3022 (plate), not 3003 (brick). Decide height first, then count studs along both edges.",
      "Only report pieces that are fully visible and whose type and color you can identify with certainty. Skip occluded, partially hidden, or unusual pieces entirely rather than guessing. In a pile this usually means reporting only a handful of pieces; never report more instances of a type than you can individually point to.",
    ].join("\n"),
    breadboard: [
      "Count discrete components. Report the microcontroller board and the breadboard if present (the ELEGOO UNO R3 is a BLACK Uno-format board; any Uno-shaped board is bb:uno).",
      "Resistors: read the first three color bands (digit, digit, multiplier) to pick the value; brown-black-brown=100Ω, red-red-brown=220Ω, orange-orange-brown=330Ω, brown-black-red=1kΩ, brown-black-orange=10kΩ. ELEGOO packs resistors taped in strips with a yellow paper label printed with the value (e.g. '220'); trust that label over the bands, and count each resistor in the strip. If the bands are unreadable and there is no label, choose the closest vocabulary value with conf ≤ 0.4.",
      "LEDs: decide the color from the tinted dome, not the light it emits; a clear dome is white unless it has four legs (bb:led_rgb). Buzzers: a green PCB on the underside means passive, a sealed bottom means active; if you cannot see the underside, report bb:buzzer_active with conf ≤ 0.5. A tiny black bead on two legs is a thermistor, a black cylinder ~12 mm with two legs from one end is a tilt switch.",
      "Modules are one item each: HC-SR04 (two silver eyes), DHT11 (blue block), joystick (thumb-stick), IR receiver, LCD1602, relay (blue block), 74HC595 / L293D (read the DIP marking), 7-segment displays (count digits), SG90 servo, 28BYJ-48 stepper, ULN2003 driver, power supply module.",
      "Jumper wires: count individually only when spread out; for a tied bundle report the number you can count with conf ≤ 0.5. Dupont female-male ribbons are bb:dupont_fm. Components still sealed in plastic bags or in the kit tray count as inventory: identify them through the bag when the shape is clear.",
      "Do not count a component that is soldered onto a module or the Uno (its LEDs, chips, headers) as a separate loose part. Only report bags/parts you can identify with certainty; skip the rest.",
    ].join("\n"),
    fabric: [
      "Each fabric scrap is one item with qty 1 and its outline as polygonMm (use the printed marker mat, 40 mm squares, for scale). Classify the fabric. For a zipper, report attrs.lengthMm.",
      "Thread may appear as a spool or as loose, tangled strands; either way report one fab:thread item (qty 1, no polygon). Also report zippers, buttons and other notions even when no fabric scrap is present.",
    ].join("\n"),
  };
  return [
    `You are the inventory scanner for a ${plugin.id} build assistant. Identify every part visible on the table.`,
    "Only use part types from this vocabulary (ids are exact):",
    vocab,
    domainNotes[plugin.id],
    "For each item, give one tight bounding box per visible instance in `boxes` (so a qty of 3 has 3 boxes) and repeat the first in `bbox`.",
    "If nothing from the vocabulary is visible, return an empty items list. Never invent part types.",
  ].join("\n\n");
}

/**
 * Aggregate per-frame detections from a scan window: per part type/color take the
 * MAX quantity seen in any single frame (never the sum: the same brick is in every frame).
 */
export function aggregateFrames(frames: InventoryItem[][]): InventoryItem[] {
  const best = new Map<string, InventoryItem & { n: number; confSum: number }>();
  for (const items of frames)
    for (const it of items) {
      const k = `${it.partType}|${it.color ?? ""}`;
      const cur = best.get(k);
      if (!cur) best.set(k, { ...it, n: 1, confSum: it.conf });
      else {
        cur.n++;
        cur.confSum += it.conf;
        if (it.qty > cur.qty) cur.qty = it.qty;
        if (it.bbox === undefined) delete cur.bbox;
        else cur.bbox = it.bbox;
        if (it.boxes === undefined) delete cur.boxes;
        else cur.boxes = it.boxes;
        if (it.polygonMm === undefined) delete cur.polygonMm;
        else cur.polygonMm = it.polygonMm;
        if (it.attrs === undefined) delete cur.attrs;
        else cur.attrs = it.attrs;
      }
    }
  return [...best.values()].map(({ n, confSum, ...it }) => ({ ...it, conf: confSum / n }));
}

export function sumFrames(frames: InventoryItem[][]): InventoryItem[] {
  const totals = new Map<string, InventoryItem & { n: number; confSum: number }>();
  for (const items of frames)
    for (const it of items) {
      const k = `${it.partType}|${it.color ?? ""}`;
      const cur = totals.get(k);
      if (!cur) totals.set(k, { ...it, n: 1, confSum: it.conf });
      else {
        cur.qty += it.qty;
        cur.n++;
        cur.confSum += it.conf;
        if (it.bbox === undefined) delete cur.bbox;
        else cur.bbox = it.bbox;
        if (it.boxes === undefined) delete cur.boxes;
        else cur.boxes = it.boxes;
        if (it.polygonMm === undefined) delete cur.polygonMm;
        else cur.polygonMm = it.polygonMm;
        if (it.attrs === undefined) delete cur.attrs;
        else cur.attrs = it.attrs;
      }
    }
  return [...totals.values()].map(({ n, confSum, ...it }) => ({ ...it, conf: confSum / n }));
}

export function mergeFrames(frames: InventoryItem[][], mode: "same-pile" | "different-bins"): InventoryItem[] {
  return mode === "different-bins" ? sumFrames(frames) : aggregateFrames(frames);
}

export function makeInventory(domain: DomainId, items: InventoryItem[], sourceId: string, frameSeqs: number[] = []): Inventory {
  return { domain, items: aggregateFrames([items]), capturedAt: new Date().toISOString(), sourceId, frameSeqs };
}
