// Inventory service (PRD §9): vocabulary-constrained structured output + video aggregation.
import { z } from "zod";
import type { DomainPlugin } from "./plugin";
import type { DomainId, Inventory, InventoryItem } from "./types";

export type Box = [number, number, number, number];

/** Vision models localize best in the `[ymin, xmin, ymax, xmax]` 0..1000 convention they were trained on; we store normalized [x, y, w, h]. */
export function fromBox2d([ymin, xmin, ymax, xmax]: number[]): Box {
  const c = (v: number) => Math.min(1, Math.max(0, v / 1000));
  const x0 = c(Math.min(xmin, xmax)), x1 = c(Math.max(xmin, xmax));
  const y0 = c(Math.min(ymin, ymax)), y1 = c(Math.max(ymin, ymax));
  return [x0, y0, x1 - x0, y1 - y0];
}

const box2d = z.array(z.number()).length(4).transform(fromBox2d);

export const SCENE_KINDS = ["loose-parts", "assembly-only", "no-parts"] as const;
export type SceneKind = (typeof SCENE_KINDS)[number];

export function inventorySchema(plugin: DomainPlugin) {
  const ids = plugin.vocabulary.map((p) => p.id) as [string, ...string[]];
  const item = z.object({
    partType: z.enum(ids),
    evidence: z.string().max(120).describe("What in the image identifies it: shape, stud count, height, color. Under 12 words."),
    qty: z.number().int().min(1).max(200),
    color: z.string().optional().describe("Dominant color name, lowercase, only when meaningful (LEGO)."),
    conf: z.number().min(0).max(1).describe("0..1 probability that this row (type, color and count) is right. 0.9+ only when studs/edges are crisply visible; 0.5 means a guess."),
    bbox: box2d.optional().describe("Box of one representative instance as [ymin, xmin, ymax, xmax], integers 0..1000 relative to the image."),
    boxes: z
      .array(box2d)
      .optional()
      .describe("One tight box per visible instance as [ymin, xmin, ymax, xmax], integers 0..1000; length must equal qty."),
    polygonMm: z
      .array(z.array(z.number()).length(2).transform((value) => value as [number, number]))
      .optional()
      .describe("Fabric only: outline of the scrap in millimetres, using the marker mat for scale."),
    attrs: z.record(z.string(), z.union([z.number(), z.string()])).optional().describe("e.g. { lengthMm: 180 } for a zipper"),
  });
  return z.object({
    scene: z.enum(SCENE_KINDS).describe("Decide this first. loose-parts: individual parts lie on a surface. assembly-only: only a built model, no loose parts. no-parts: people, screens, rooms, hands, or anything without parts."),
    sceneNote: z.string().max(120).describe("One short sentence describing what the image shows."),
    items: z.array(item).describe("Empty unless scene is loose-parts."),
  });
}

export type InventoryOutput = z.infer<ReturnType<typeof inventorySchema>>;

export function inventoryPrompt(plugin: DomainPlugin): string {
  const vocab = plugin.vocabulary.map((p) => `- ${p.id}: ${p.name} — ${p.visionHint}`).join("\n");
  const domainNotes: Record<DomainId, string> = {
    lego: [
      "Count each brick type per color. Report color names in lowercase (red, blue, yellow, white, black, green, bright green, lime, dark green, dark blue, medium blue, medium azure, dark red, coral, reddish brown, brown, pink, bright pink, purple, sand green, light gray, dark gray, tan, orange, trans clear, trans orange). Use the closest listed name; never invent compound names.",
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
    `You are the inventory scanner for a ${plugin.id} build assistant. Identify every loose part visible on the table.`,
    "First decide what the image is. Most frames from a wearable camera show people, laptops, screens, food, or a room: for those set scene to no-parts and return no items at all. Only when individual parts lie on a surface within reach set scene to loose-parts. Do not describe a screen, photo, print or reflection as parts.",
    "For every item, write `evidence` before `conf`: what you actually see (e.g. 'red 2x4 brick, 8 studs, tall side'). If you cannot write concrete evidence for a part, do not report it. A frame with no parts must produce an empty list, never a plausible-sounding guess.",
    "Calibrate conf: 0.9+ studs and edges clearly visible and count certain; 0.7 type certain but color or count slightly uncertain; 0.5 or less is a guess and should usually be left out.",
    "Only use part types from this vocabulary (ids are exact):",
    vocab,
    domainNotes[plugin.id],
    "For each item, give one tight bounding box per visible instance in `boxes` (so a qty of 3 has 3 boxes) and repeat the first in `bbox`. Boxes are [ymin, xmin, ymax, xmax] in 0..1000 image coordinates and must hug the piece itself, not the area around it; a box should never cover more than a quarter of the image.",
    "Ignore laptops, screens, hands, furniture and anything that is not a loose part; if you cannot point to a piece precisely, leave it out.",
    "If nothing from the vocabulary is visible, return an empty items list. Never invent part types.",
  ].join("\n\n");
}

/**
 * Aggregate per-frame detections from a scan window: per part type/color take the
 * MAX quantity seen in any single frame (never the sum: the same brick is in every frame).
 * Rows seen in fewer than `minFrames` frames are dropped (one-frame hallucinations).
 */
export function aggregateFrames(frames: InventoryItem[][], minFrames = 1): InventoryItem[] {
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
  return [...best.values()].filter((it) => it.n >= minFrames).map(({ n, confSum, ...it }) => ({ ...it, conf: confSum / n }));
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

export const MIN_CONF = 0.6;
/** LEGO frames are the ones that hallucinate (studs look like keyboards); other domains ask for low-conf rows on purpose. */
export const SANITIZE_BY_DOMAIN: Record<DomainId, SanitizeOptions> = {
  lego: { minConf: MIN_CONF, requireBoxes: true },
  breadboard: { minConf: 0.3 },
  fabric: { minConf: 0.3 },
};
const MIN_SIDE = 0.01;
const MAX_AREA = 0.3;

function plausible(b: Box): boolean {
  return b[2] >= MIN_SIDE && b[3] >= MIN_SIDE && b[2] * b[3] <= MAX_AREA;
}

export interface SanitizeOptions {
  minConf?: number;
  /** Every counted instance must have a plausible box (live camera frames); qty is clamped to the boxes kept. */
  requireBoxes?: boolean;
}

/**
 * Drop low-confidence rows and boxes that cannot be a single part (degenerate or
 * covering a large part of the frame), and keep `boxes` consistent with `qty`.
 */
export function sanitizeItems(items: InventoryItem[], opts: SanitizeOptions = {}): InventoryItem[] {
  const minConf = opts.minConf ?? MIN_CONF;
  const out: InventoryItem[] = [];
  for (const it of items) {
    if (it.conf < minConf) continue;
    const boxes = (it.boxes?.length ? it.boxes : it.bbox ? [it.bbox] : []).filter(plausible).slice(0, it.qty);
    const next: InventoryItem = { ...it };
    if (boxes.length) {
      next.boxes = boxes;
      next.bbox = boxes[0];
      if (opts.requireBoxes) next.qty = boxes.length;
    } else {
      if (opts.requireBoxes) continue;
      delete next.boxes;
      delete next.bbox;
    }
    out.push(next);
  }
  return out;
}

/** Apply the scene gate and per-item sanitising to a raw model response. */
export function itemsFromOutput(out: InventoryOutput, opts: SanitizeOptions = {}): InventoryItem[] {
  if (out.scene !== "loose-parts") return [];
  const items: InventoryItem[] = out.items.map((it) => {
    const { evidence, ...rest } = it;
    void evidence;
    return rest;
  });
  return sanitizeItems(items, opts);
}

export function makeInventory(domain: DomainId, items: InventoryItem[], sourceId: string, frameSeqs: number[] = []): Inventory {
  return { domain, items: aggregateFrames([items]), capturedAt: new Date().toISOString(), sourceId, frameSeqs };
}
