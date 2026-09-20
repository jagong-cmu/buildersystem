import { z } from "zod";
import type { DomainId, PartType } from "@/core/types";
import { getPlugin } from "@/domains";
import { visionObject } from "@/lib/vision";

export const mappingSchema = z.object({
  mappings: z.array(z.object({ name: z.string(), partTypeId: z.string().nullable(), confidence: z.number().min(0).max(1) })),
});
export type PartMapping = z.infer<typeof mappingSchema>["mappings"][number];

const slug = (name: string) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "part";

export async function mapParts(domain: DomainId, names: string[], model?: string): Promise<PartMapping[]> {
  const vocabulary = getPlugin(domain).vocabulary;
  const result = await visionObject({
    schema: mappingSchema,
    model,
    system: "Map each manual part name to the closest vocabulary part. Return null when uncertain; never omit a requested name.",
    text: JSON.stringify({ domain, names, vocabulary: vocabulary.map(({ id, name, visionHint }) => ({ id, name, visionHint })) }),
    images: [],
  });
  return applyMappings(domain, names, result.mappings);
}

export function applyMappings(domain: DomainId, names: string[], mappings: PartMapping[], vocabulary = getPlugin(domain).vocabulary): PartMapping[] {
  const byName = new Map(mappings.map((mapping) => [mapping.name.toLowerCase(), mapping]));
  const valid = new Set(vocabulary.map((part) => part.id));
  return names.map((name) => {
    const candidate = byName.get(name.toLowerCase());
    if (candidate && candidate.partTypeId && valid.has(candidate.partTypeId) && candidate.confidence >= 0.6) return candidate;
    return { name, partTypeId: `ext:${slug(name)}`, confidence: candidate?.confidence ?? 0 };
  });
}

export function extraPartTypes(domain: DomainId, mappings: PartMapping[], vocabulary = getPlugin(domain).vocabulary): PartType[] {
  const known = new Set(vocabulary.map((part) => part.id));
  return mappings
    .filter((mapping) => !mapping.partTypeId || !known.has(mapping.partTypeId) || mapping.partTypeId.startsWith("ext:"))
    .map((mapping) => ({ id: mapping.partTypeId ?? `ext:${slug(mapping.name)}`, domain, name: mapping.name, visionHint: mapping.name }));
}
