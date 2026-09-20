import { promises as fs } from "node:fs";
import path from "node:path";
import type { DomainId } from "@/core/types";
import { buildDocumentManual, documentManualSchema, type DocumentManualInput } from "@/core/document";
import { mapParts } from "@/lib/ingest/map-parts";
import { parsePages, type ParsedStep } from "@/lib/ingest/parse";
import { getPageImage, pageCacheDir, rasterizePdf } from "@/lib/ingest/rasterize";
import { VISION_MOCK } from "@/lib/vision";
import { rootPath, withRetry } from "./client";

export interface IngestClient {
  filesUpload(arg: { path: string; contents: string | Uint8Array; mode?: { ".tag": "overwrite" } }): Promise<unknown>;
}

export interface IngestDraft extends DocumentManualInput {
  pageCount: number;
}

function cacheManualDir(domain: DomainId, id: string) {
  return path.join(process.cwd(), ".cache", "dropbox", "manuals", domain, id);
}

async function uploadJson(client: IngestClient, domain: DomainId, id: string, filename: string, value: unknown) {
  const contents = JSON.stringify(value, null, 2);
  await withRetry(() => client.filesUpload({ path: rootPath(`/Manuals/${domain}/${id}/${filename}`), contents, mode: { ".tag": "overwrite" } }));
}

function mockSteps(pageCount: number): ParsedStep[] {
  return [
    { n: 1, text: "Place the first components according to the highlighted region.", partsUsed: [{ name: "component", qty: 1 }], region: { page: 1, bbox: [0.1, 0.1, 0.8, 0.35] }, confidence: 0.82 },
    { n: 2, text: "Complete the assembly in the highlighted region.", partsUsed: [{ name: "component", qty: 1 }], region: { page: Math.min(2, pageCount), bbox: [0.1, 0.5, 0.8, 0.35] }, confidence: 0.68 },
  ];
}

export async function ingestPdf(client: IngestClient, domain: DomainId, id: string): Promise<IngestDraft> {
  const sourcePath = path.join(cacheManualDir(domain, id), "source.pdf");
  let pageCount: number;
  let steps: ParsedStep[];
  if (VISION_MOCK) {
    const source = new Uint8Array(await fs.readFile(sourcePath));
    pageCount = Math.max(1, (await rasterizePdf(source)).pages.length);
    steps = mockSteps(pageCount);
  } else {
    const source = new Uint8Array(await fs.readFile(sourcePath));
    const rasterized = await rasterizePdf(source);
    pageCount = rasterized.pages.length;
    const pagesDir = pageCacheDir(domain, id);
    await fs.mkdir(pagesDir, { recursive: true });
    await Promise.all(rasterized.pages.map((page, index) => fs.writeFile(path.join(pagesDir, `page-${index + 1}.png`), page)));
    await fs.writeFile(path.join(pagesDir, "pages.json"), JSON.stringify({ count: pageCount, width: rasterized.width, height: rasterized.height }));
    const parsed = await parsePages(rasterized.pages);
    steps = parsed.steps;
  }
  const names = [...new Set(steps.flatMap((step) => step.partsUsed.map((part) => part.name)))];
  const mappings = VISION_MOCK
    ? names.map((name) => ({ name, partTypeId: null, confidence: 0 }))
    : await mapParts(domain, names);
  const draft: IngestDraft = {
    steps,
    mappings,
    detectedDomain: domain,
    pageCount,
    meta: { title: id, description: "PDF instruction manual", estMinutes: Math.max(1, steps.length) },
  };
  await fs.mkdir(cacheManualDir(domain, id), { recursive: true });
  await fs.writeFile(path.join(cacheManualDir(domain, id), "draft.json"), JSON.stringify(draft, null, 2));
  await uploadJson(client, domain, id, "draft.json", draft);
  return draft;
}

export async function publishDraft(client: IngestClient, domain: DomainId, id: string, draft: unknown) {
  const parsed = documentManualSchema.parse(draft);
  const manual = buildDocumentManual({
    id,
    domain,
    meta: parsed.meta ?? { title: id, description: "", estMinutes: parsed.steps.length },
    steps: parsed.steps,
    mappings: parsed.mappings,
  });
  const directory = cacheManualDir(domain, id);
  await fs.mkdir(directory, { recursive: true });
  const ingested = { ...parsed, id, domain, meta: { ...manual, thumbnail: undefined } };
  await fs.writeFile(path.join(directory, "ingested.json"), JSON.stringify(ingested, null, 2));
  await uploadJson(client, domain, id, "ingested.json", ingested);
  return manual.id;
}

export async function loadDraft(domain: DomainId, id: string): Promise<IngestDraft> {
  return JSON.parse(await fs.readFile(path.join(cacheManualDir(domain, id), "draft.json"), "utf8")) as IngestDraft;
}

export { getPageImage };
