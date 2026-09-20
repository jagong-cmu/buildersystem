// Server-only: electronic part identification with an off-the-shelf zero-shot image model (CLIP)
// run locally through transformers.js / onnxruntime — no API key, weights are downloaded once into
// PART_CLASSIFIER_CACHE. The caller localizes instances first (vision model boxes) and sends one
// crop per instance; candidate labels come from the domain vocabulary.
import os from "node:os";
import path from "node:path";
import { env, pipeline, RawImage, type ZeroShotImageClassificationPipeline } from "@huggingface/transformers";
import type { PartType } from "@/core/types";

/** ViT-L/14 is the smallest CLIP that separates small components reliably; base/q8 confuse LEDs, LDRs and boards. */
export const PART_CLASSIFIER_MODEL = process.env.PART_CLASSIFIER_MODEL ?? "Xenova/clip-vit-large-patch14";
export const PART_CLASSIFIER_CACHE = process.env.PART_CLASSIFIER_CACHE ?? path.join(os.homedir(), ".cache", "buildersystem-models");
/** PART_CLASSIFIER=0 keeps the plain vision-model pipeline for breadboard parts. */
export const PART_CLASSIFIER_ENABLED = process.env.PART_CLASSIFIER !== "0";

export interface Candidate {
  id: string;
  label: string;
}
export interface ClassifierHit {
  id: string;
  score: number;
}

let classifier: Promise<ZeroShotImageClassificationPipeline> | undefined;

/** Load (and on first use download) the model once per process. Failures are not cached so a retry can succeed. */
export function loadClassifier(): Promise<ZeroShotImageClassificationPipeline> {
  if (!classifier) {
    env.cacheDir = PART_CLASSIFIER_CACHE;
    classifier = pipeline("zero-shot-image-classification", PART_CLASSIFIER_MODEL, { dtype: "fp32" }).catch((e: unknown) => {
      classifier = undefined;
      throw e;
    });
  }
  return classifier;
}

/** Score `candidates` against one crop; returns hits sorted by score desc (softmax over the labels). */
export async function classifyCrop(image: { data: Uint8Array; mediaType: string }, candidates: Candidate[]): Promise<ClassifierHit[]> {
  const clf = await loadClassifier();
  const img = await RawImage.fromBlob(new Blob([image.data as BlobPart], { type: image.mediaType }));
  const raw = (await clf(img, candidates.map((c) => c.label))) as { label: string; score: number }[];
  const byLabel = new Map(candidates.map((c) => [c.label, c.id]));
  return raw
    .flatMap((r) => {
      const id = byLabel.get(r.label);
      return id ? [{ id, score: r.score }] : [];
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Short visual descriptions used as CLIP prompts. Plain catalogue names ("Photoresistor (LDR)")
 * score noticeably worse than a description of what the crop actually shows.
 */
const CLIP_LABELS: Record<string, string> = {
  "bb:uno": "an Arduino Uno microcontroller board",
  "bb:breadboard": "a white solderless breadboard",
  "bb:expansion_shield": "a blue Arduino prototype shield with a mini breadboard on top",
  "bb:jumper": "a bundle of coloured jumper wires",
  "bb:dupont_fm": "a ribbon of coloured Dupont wires with black connector housings",
  "bb:resistor": "a resistor with colour bands",
  "bb:led": "a 5 mm LED light-emitting diode with two legs",
  "bb:led_rgb": "an RGB LED with four legs",
  "bb:photoresistor": "a photoresistor light sensor, a flat disc with a wavy trace",
  "bb:thermistor": "a black NTC thermistor bead",
  "bb:tilt_switch": "a tilt ball switch, a small black cylinder",
  "bb:pushbutton": "a tactile pushbutton switch",
  "bb:potentiometer": "a rotary potentiometer",
  "bb:buzzer_active": "a round black buzzer with a sticker on top",
  "bb:buzzer_passive": "a round black buzzer showing a green circuit board underneath",
  "bb:diode_1n4007": "a black axial diode with a silver band",
  "bb:transistor_pn2222": "a TO-92 transistor",
  "bb:ic_74hc595": "a 16-pin DIP integrated circuit labelled 74HC595",
  "bb:ic_l293d": "a 16-pin DIP integrated circuit labelled L293D",
  "bb:seg7_1": "a one-digit 7-segment LED display",
  "bb:seg7_4": "a four-digit 7-segment LED display",
  "bb:lcd1602": "an LCD1602 display module",
  "bb:relay_5v": "a blue 5V relay",
  "bb:ir_receiver": "an IR receiver module",
  "bb:ir_remote": "an IR remote control",
  "bb:joystick": "a joystick module",
  "bb:dht11": "a blue DHT11 humidity sensor",
  "bb:ultrasonic_hcsr04": "an HC-SR04 ultrasonic sensor",
  "bb:servo_sg90": "an SG90 servo motor",
  "bb:stepper_28byj48": "a 28BYJ-48 stepper motor",
  "bb:uln2003": "a ULN2003 driver board",
  "bb:dc_motor": "a small DC motor",
  "bb:fan_blade": "a plastic fan blade",
  "bb:power_module": "a breadboard power supply module",
  "bb:battery_9v": "a 9V battery",
  "bb:usb_cable": "a USB cable",
};

/**
 * Zero-shot candidates for a vocabulary. Visually indistinguishable variants (resistor values,
 * LED colours) collapse onto one label so the classifier is not asked to split its probability
 * mass between look-alikes; the caller keeps the vision model's variant.
 */
export function candidatesFor(vocab: readonly PartType[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const p of vocab) {
    const group = variantGroup(p.id);
    if (seen.has(group)) continue;
    seen.add(group);
    const desc = CLIP_LABELS[group] ?? `a ${p.name.replace(/\s*\(.*\)$/, "").toLowerCase()}`;
    out.push({ id: group, label: `a photo of ${desc}` });
  }
  return out;
}

const VARIANT_GROUPS: [RegExp, string][] = [
  [/^bb:resistor_/, "bb:resistor"],
  [/^bb:led_(?!rgb$)/, "bb:led"],
];

/** Vocabulary id -> the label group it is classified under (itself when it has no look-alikes). */
export function variantGroup(id: string): string {
  for (const [re, group] of VARIANT_GROUPS) if (re.test(id)) return group;
  return id;
}

/**
 * Pick the vocabulary id for a crop given the classifier's top hit and the vision model's label.
 * Inside a look-alike group the vision label wins when it belongs to the same group (it read the
 * bands / colour); otherwise the first vocabulary member of the group is used.
 */
export function resolvePart(hitGroup: string, visionId: string, vocab: readonly PartType[]): string {
  if (variantGroup(visionId) === hitGroup) return visionId;
  if (vocab.some((p) => p.id === hitGroup)) return hitGroup;
  return vocab.find((p) => variantGroup(p.id) === hitGroup)?.id ?? visionId;
}
