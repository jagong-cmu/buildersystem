// Server-only: one structured-output vision call. Provider chosen from env (PRD §16, §21.3).
import { generateText, Output } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { z } from "zod";

export const VISION_MODEL = process.env.VISION_MODEL ?? "anthropic/claude-sonnet-5";

/** VISION_MOCK=1: routes return deterministic fake detections (no provider, no cost) for demos and CI. */
export const VISION_MOCK = process.env.VISION_MOCK === "1";

/** Cheap stable hash of image bytes so mock results vary per frame but repeat per frame. */
export function imageHash(images: { data: Uint8Array }[]): number {
  let h = 2166136261;
  for (const im of images) {
    const step = Math.max(1, Math.floor(im.data.length / 512));
    for (let i = 0; i < im.data.length; i += step) h = Math.imul(h ^ im.data[i], 16777619) >>> 0;
  }
  return h >>> 0;
}

export function visionModel() {
  if (process.env.AI_GATEWAY_API_KEY) return VISION_MODEL; // plain string routes via AI Gateway
  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropic(VISION_MODEL.replace(/^anthropic\//, ""));
  }
  return null;
}

export async function visionObject<S extends z.ZodTypeAny>(opts: {
  schema: S;
  system: string;
  text: string;
  images: { data: Uint8Array; mediaType: string }[];
}): Promise<z.infer<S>> {
  const model = visionModel();
  if (!model) throw new Error("No vision provider configured: set AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY in apps/web/.env.local");
  const { output } = await generateText({
    model,
    output: Output.object({ schema: opts.schema }),
    system: opts.system,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: opts.text },
          ...opts.images.map((im) => ({ type: "file" as const, mediaType: im.mediaType, data: im.data })),
        ],
      },
    ],
  });
  return output as z.infer<S>;
}
