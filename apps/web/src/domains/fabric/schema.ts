import { z } from "zod";

const point = z.tuple([z.number(), z.number()]);

export const fabricManualSchema = z.object({
  pieces: z.array(
    z.object({
      id: z.string(),
      polygonMm: z.array(point).min(3), // includes seam allowance
      fabricClass: z.string(),
      qty: z.number().int().min(1).default(1),
    }),
  ),
  notions: z
    .array(z.object({ partType: z.string(), qty: z.number().int().min(1), minLengthMm: z.number().optional() }))
    .default([]),
  steps: z.array(
    z.object({
      title: z.string().optional(),
      kind: z.enum(["cut", "fold", "pin", "sew", "attach", "turn"]),
      pieces: z.array(z.string()).optional(),
      seam: z.object({ a: z.tuple([z.string(), z.string()]), b: z.tuple([z.string(), z.string()]) }).optional(),
      notion: z.string().optional(),
      text: z.string(),
    }),
  ),
});

export type FabricManualJson = z.infer<typeof fabricManualSchema>;
