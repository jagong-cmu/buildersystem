import { z } from "zod";

const hole = z.object({ row: z.string(), col: z.number().int().min(1).max(30) });
const boardPin = z.object({ board: z.string() });
const endpoint = z.union([hole, boardPin]);

export const probeSchema = z.object({
  pin: z.string(),
  mode: z.enum(["analogRead", "digitalRead", "pulse"]),
  expect: z.object({ min: z.number().optional(), max: z.number().optional(), value: z.union([z.literal(0), z.literal(1)]).optional() }),
  note: z.string().optional(),
});

export const breadboardManualSchema = z.object({
  board: z.string().default("uno"),
  parts: z.array(
    z.object({
      id: z.string(),
      partType: z.string(),
      pins: z.array(hole).min(1),
      polarity: z.array(z.string()).optional(),
    }),
  ),
  wires: z.array(z.object({ id: z.string(), from: endpoint, to: endpoint, color: z.string().optional() })),
  steps: z.array(
    z.object({
      title: z.string().optional(),
      add: z.array(z.string()).min(1),
      text: z.string(),
      probes: z.array(probeSchema).optional(),
    }),
  ),
  sketch: z.string().optional(),
});

export type BreadboardManualJson = z.infer<typeof breadboardManualSchema>;
