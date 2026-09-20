import { z } from "zod";
import { deriveRequires } from "./multiset";
import type { DomainId, Manual, ManualMeta, PagePlacement, PartInstance, PartType, Step } from "./types";
import { getPlugin } from "@/domains";

export const documentStepSchema = z.object({
  n: z.number().int().positive().optional(),
  text: z.string(),
  partsUsed: z.array(z.object({ name: z.string(), qty: z.number().positive() })),
  region: z.object({ page: z.number().int().positive(), bbox: z.array(z.number()).length(4) }),
  cautions: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),
});
export const documentMappingSchema = z.object({
  name: z.string(),
  partTypeId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});
export const documentManualSchema = z.object({
  id: z.string().optional(),
  domain: z.enum(["lego", "breadboard", "fabric"]).optional(),
  meta: z.object({ title: z.string(), description: z.string(), estMinutes: z.number(), thumbnail: z.string().optional() }).optional(),
  steps: z.array(documentStepSchema),
  mappings: z.array(documentMappingSchema),
  detectedDomain: z.enum(["lego", "breadboard", "fabric", "other"]).optional(),
  pageCount: z.number().int().positive().optional(),
});
export type DocumentManualInput = z.infer<typeof documentManualSchema>;
export type DocumentStep = z.infer<typeof documentStepSchema>;
export type DocumentMapping = z.infer<typeof documentMappingSchema>;

function partTypeFor(mapping: DocumentMapping, domain: DomainId): PartType {
  const id = mapping.partTypeId?.startsWith("ext:") ? mapping.partTypeId : `ext:${mapping.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
  return { id, domain, name: mapping.name, visionHint: mapping.name };
}

export function buildDocumentManual(input: {
  id: string;
  domain: DomainId;
  meta: ManualMeta;
  steps: DocumentStep[];
  mappings: DocumentMapping[];
}): Manual<PagePlacement> {
  const mappingByName = new Map(input.mappings.map((mapping) => [mapping.name.toLowerCase(), mapping]));
  const parts: PartInstance<PagePlacement>[] = [];
  const steps: Step<PagePlacement>[] = input.steps.map((step, index) => {
    const placement: PagePlacement = { kind: "page", page: step.region.page, bbox: step.region.bbox as [number, number, number, number] };
    const added: PartInstance<PagePlacement>[] = [];
    for (const used of step.partsUsed) {
      const mapping = mappingByName.get(used.name.toLowerCase()) ?? { name: used.name, partTypeId: `ext:${used.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, confidence: 0 };
      for (let k = 0; k < used.qty; k++) {
        const instance: PartInstance<PagePlacement> = {
          id: `s${index + 1}-${mapping.partTypeId ?? mapping.name}-${k + 1}`.replace(/[^a-zA-Z0-9:_-]/g, "_"),
          partType: mapping.partTypeId ?? `ext:${mapping.name}`,
          placement,
        };
        added.push(instance);
        parts.push(instance);
      }
    }
    return {
      n: index + 1,
      title: `Step ${index + 1}`,
      text: step.text,
      add: added.map((part) => part.id),
      callouts: deriveRequires(added, false),
      expected: { description: step.text },
      meta: { region: placement, confidence: step.confidence, cautions: step.cautions },
    };
  });
  const known = new Set(getPlugin(input.domain).vocabulary.map((part) => part.id));
  const extraParts = [...input.mappings, ...input.steps.flatMap((step) => step.partsUsed.map((part) => ({ name: part.name, partTypeId: null, confidence: 0 })))]
    .filter((mapping) => !mapping.partTypeId || !known.has(mapping.partTypeId))
    .filter((mapping, index, all) => all.findIndex((candidate) => candidate.name.toLowerCase() === mapping.name.toLowerCase()) === index)
    .map((mapping) => partTypeFor(mapping, input.domain));
  return {
    id: input.id,
    domain: input.domain,
    title: input.meta.title,
    description: input.meta.description,
    estMinutes: input.meta.estMinutes,
    thumbnail: input.meta.thumbnail ?? "",
    render: "document",
    extraParts,
    needsReview: input.steps.some((step) => step.confidence < 0.7),
    source: { kind: "json", path: `manuals/${input.domain}/${input.id}/ingested.json` },
    requires: deriveRequires(parts, false),
    parts,
    steps,
  };
}

export function loadDocumentManual(input: { id: string; dir: string; meta: ManualMeta; files: Record<string, string> }): Manual<PagePlacement> {
  const raw = documentManualSchema.parse(JSON.parse(input.files["ingested.json"]));
  const domain = input.dir.split("/")[1] as DomainId;
  return buildDocumentManual({
    id: input.id,
    domain,
    meta: raw.meta ?? input.meta,
    steps: raw.steps,
    mappings: raw.mappings,
  });
}
