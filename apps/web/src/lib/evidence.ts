import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { VerifyEvidence } from "@/core/types";

const HUB = (process.env.HUB_HTTP ?? (process.env.NEXT_PUBLIC_HUB_WS ?? "ws://localhost:8787").replace(/^ws/, "http")).replace(/\/$/, "");
const CACHE_ROOT = path.join(process.cwd(), ".cache", "evidence");

interface HubFrame {
  data: Uint8Array;
  mediaType: "image/jpeg";
}

export interface CaptureEvidenceInput {
  manualId: string;
  step: number;
  armedAt?: number;
  sourceId?: string;
  expected?: Uint8Array;
}

export interface CaptureEvidenceResult extends VerifyEvidence {
  beforeFrame?: HubFrame;
  afterFrame?: HubFrame;
}

async function hubFrame(endpoint: string): Promise<HubFrame | null> {
  try {
    const response = await fetch(`${HUB}${endpoint}`, { cache: "no-store" });
    if (!response.ok) return null;
    return { data: new Uint8Array(await response.arrayBuffer()), mediaType: "image/jpeg" };
  } catch {
    return null;
  }
}

async function resolveSource(sourceId?: string) {
  try {
    const response = await fetch(`${HUB}/sources`, { cache: "no-store" });
    if (!response.ok) return null;
    const sources = (await response.json()) as { id: string; kind: string; online: boolean }[];
    const source = sourceId ? sources.find((candidate) => candidate.id === sourceId) : sources.find((candidate) => candidate.online) ?? sources[0];
    return source ? { id: source.id, kind: source.kind } : null;
  } catch {
    return null;
  }
}

export async function captureEvidence(input: CaptureEvidenceInput): Promise<CaptureEvidenceResult> {
  const verifiedAt = Date.now();
  const source = await resolveSource(input.sourceId);
  const prefix = `${String(input.step).padStart(2, "0")}-${verifiedAt}`;
  const evidenceId = `${input.manualId}/${prefix}`;
  const directory = path.join(CACHE_ROOT, input.manualId);
  const base: CaptureEvidenceResult = {
    evidenceId,
    sourceId: source?.id,
    sourceKind: source?.kind,
    before: false,
    after: false,
    expected: false,
    armedAt: input.armedAt,
    verifiedAt,
  };
  let expected = false;
  if (input.expected) {
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, `${prefix}-expected.png`), input.expected);
      expected = true;
    } catch {}
  }
  if (!source) return { ...base, expected };

  const beforeFrame = input.armedAt
    ? await hubFrame(`/frames/at?source=${encodeURIComponent(source.id)}&ts=${input.armedAt}`)
    : null;
  const afterFrame = await hubFrame(`/frames/latest?source=${encodeURIComponent(source.id)}`);
  try {
    await mkdir(directory, { recursive: true });
    if (beforeFrame) await writeFile(path.join(directory, `${prefix}-before.jpg`), beforeFrame.data);
    if (afterFrame) await writeFile(path.join(directory, `${prefix}-after.jpg`), afterFrame.data);
  } catch {
    return { ...base, expected, beforeFrame: beforeFrame ?? undefined, afterFrame: afterFrame ?? undefined };
  }
  return {
    ...base,
    before: !!beforeFrame,
    after: !!afterFrame,
    expected,
    beforeFrame: beforeFrame ?? undefined,
    afterFrame: afterFrame ?? undefined,
  };
}
