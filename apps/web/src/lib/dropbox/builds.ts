import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AppliedSub, Manual, VerifyResult } from "@/core/types";
import { rootPath, withRetry } from "@/lib/dropbox/client";

export interface BuildStepRecord {
  n: number;
  status: string;
  hint?: string;
  conf?: number;
  before: boolean;
  after: boolean;
  expected: boolean;
  sourceKind?: string;
}

export interface BuildRecord {
  path: string;
  manualId: string;
  title: string;
  date: string;
  startedAt: number;
  finishedAt: number;
  steps: BuildStepRecord[];
  subs: AppliedSub[];
}

export interface BuildFile {
  name: string;
  contents: string | Uint8Array;
}

export interface BuildUploadFailure {
  name: string;
  error: string;
}

export interface BuildUploadClient {
  filesUpload(arg: { path: string; contents: string | Uint8Array; mode?: { ".tag": "overwrite" } }): Promise<unknown>;
  sharingCreateSharedLinkWithSettings(arg: { path: string }): Promise<{ result?: { url?: string } }>;
  sharingListSharedLinks(arg: { path: string; direct_only: boolean }): Promise<{ result?: { links?: { url?: string }[] } }>;
}

export function buildRecordPath(manual: Manual, date: Date, shortid: string) {
  return rootPath(`/Builds/${date.toISOString().slice(0, 10)}-${manual.id}-${shortid.slice(0, 6)}`);
}

export function renderReadme(record: BuildRecord) {
  const glasses = record.steps.some((step) => step.sourceKind === "glasses");
  const rows = record.steps.map((step) =>
    `| ${String(step.n).padStart(2, "0")} | ${step.status} | ${step.hint ?? "—"} | ${step.sourceKind ?? "—"} | ${step.before ? "yes" : "no"} | ${step.after ? "yes" : "no"} |`,
  );
  const substitutions = record.subs.length
    ? record.subs.map((sub) => `- ${sub.note}${sub.forStep ? ` (step ${sub.forStep})` : ""}`).join("\n")
    : "- None";
  return `# ${record.title}

Built on ${record.date}

${glasses ? "Documented from the builder's point of view via Ray-Ban Meta glasses\n\n" : ""}## Steps

| Step | Status | Hint | Source | Before | After |
| --- | --- | --- | --- | --- | --- |
${rows.join("\n") || "| — | — | — | — | — | —"}

## Substitutions

${substitutions}
`;
}

function isSharedLinkConflict(error: unknown) {
  return (error as { status?: number }).status === 409 || JSON.stringify(error).includes("shared_link_already_exists");
}

function errorString(error: unknown) {
  const summary = (error as { error?: { error_summary?: unknown } })?.error?.error_summary;
  return typeof summary === "string" ? summary : error instanceof Error ? error.message : String(error);
}

export async function writeBuildRecord(dbx: BuildUploadClient, record: BuildRecord, files: BuildFile[]) {
  const failed: BuildUploadFailure[] = [];
  const ordered = [...files].sort((a, b) => Number(a.name === "result.json") - Number(b.name === "result.json"));
  for (const file of ordered) {
    try {
      await withRetry(() => dbx.filesUpload({ path: `${recordPath(record)}/${file.name}`, contents: file.contents, mode: { ".tag": "overwrite" } }));
    } catch (error) {
      failed.push({ name: file.name, error: errorString(error) });
    }
  }

  if (files.length > 0 && failed.length === files.length) {
    return { path: recordPath(record), url: undefined, error: failed[0].error, failed };
  }

  let url: string | undefined;
  try {
    url = (await withRetry(() => dbx.sharingCreateSharedLinkWithSettings({ path: recordPath(record) }))).result?.url;
  } catch (error) {
    if (isSharedLinkConflict(error)) {
      try {
        url = (await withRetry(() => dbx.sharingListSharedLinks({ path: recordPath(record), direct_only: true }))).result?.links?.[0]?.url;
      } catch (listError) {
        failed.push({ name: "shared link", error: errorString(listError) });
      }
    } else {
      failed.push({ name: "shared link", error: errorString(error) });
    }
  }
  return { path: recordPath(record), url, failed };
}

function recordPath(record: BuildRecord) {
  return record.path;
}

export interface BuildRecordSource {
  path: string;
  manual: Manual;
  verify: Record<number, VerifyResult>;
  subs: AppliedSub[];
  startedAt: number;
}

export function makeBuildRecord(source: BuildRecordSource, pathName: string, finishedAt = Date.now()): BuildRecord {
  const steps = Object.values(source.verify)
    .sort((a, b) => a.step - b.step)
    .map((result) => ({
      n: result.step,
      status: result.status,
      hint: result.hint,
      conf: result.conf,
      before: !!result.evidence?.before,
      after: !!result.evidence?.after,
      expected: !!result.evidence?.expected,
      sourceKind: result.evidence?.sourceKind,
    }));
  return {
    path: pathName,
    manualId: source.manual.id,
    title: source.manual.title,
    date: new Date(finishedAt).toISOString().slice(0, 10),
    startedAt: source.startedAt,
    finishedAt,
    steps,
    subs: source.subs,
  };
}

export async function filesForBuild(source: BuildRecordSource, record: BuildRecord) {
  const files: BuildFile[] = [
    { name: "README.md", contents: renderReadme(record) },
    { name: "manual.json", contents: JSON.stringify(source.manual, null, 2) },
  ];
  for (const result of Object.values(source.verify).sort((a, b) => a.step - b.step)) {
    const evidenceId = result.evidence?.evidenceId;
    if (!evidenceId) continue;
    const [manualId, prefix] = evidenceId.split("/", 2);
    const directory = path.join(process.cwd(), ".cache", "evidence", manualId);
    for (const suffix of ["before.jpg", "after.jpg", "expected.png"] as const) {
      if (!result.evidence?.[suffix === "expected.png" ? "expected" : suffix === "before.jpg" ? "before" : "after"]) continue;
      try {
        files.push({ name: `steps/${String(result.step).padStart(2, "0")}-${suffix}`, contents: await readFile(path.join(directory, `${prefix}-${suffix}`)) });
      } catch {}
    }
  }
  if (source.manual.thumbnail?.endsWith(".svg")) {
    try {
      files.push({ name: "thumb.svg", contents: await readFile(path.join(process.cwd(), "public", source.manual.thumbnail.replace(/^\//, ""))) });
    } catch {}
  }
  files.push({
    name: "result.json",
    contents: JSON.stringify({
      manualId: source.manual.id,
      startedAt: source.startedAt,
      finishedAt: record.finishedAt,
      subs: source.subs,
      steps: record.steps,
    }, null, 2),
  });
  return files;
}
