import type { Manual } from "@/core/types";
import { getPlugin } from "@/domains";
import { listManualDirs, loadLibrary } from "@/core/library";
import { MANUALS } from "./manuals";
import { libraryManualsDir } from "./dropbox/library";

export interface LibraryEntry {
  domain: string;
  id: string;
  source: "builtin" | "dropbox";
  files: string[];
  status: "ok" | "error" | "pdf" | "draft" | "needs review";
  error?: string;
  manual?: Manual;
  draft?: boolean;
  overridesBuiltin?: boolean;
}

function withRuntimeThumbnail(manual: Manual) {
  if (manual.render === "document") {
    manual.thumbnail = `/api/manuals/${manual.domain}/${manual.id}/page/1`;
    return manual;
  }
  const plugin = getPlugin(manual.domain);
  if (plugin.thumbnailSvg) manual.thumbnail = `/api/manuals/${manual.domain}/${manual.id}/thumb.svg`;
  return manual;
}

export function mergeManuals(builtin: Manual[], runtime: Manual[]): Manual[] {
  const result = [...builtin];
  const positions = new Map(result.map((manual, index) => [manual.id, index]));
  for (const manual of runtime) {
    const index = positions.get(manual.id);
    if (index === undefined) {
      positions.set(manual.id, result.length);
      result.push(manual);
    } else {
      result[index] = manual;
    }
  }
  return result;
}

async function runtimeLibrary() {
  return loadLibrary(libraryManualsDir());
}

export async function getManuals(): Promise<Manual[]> {
  const { manuals } = await runtimeLibrary();
  return mergeManuals(MANUALS, manuals.map(withRuntimeThumbnail));
}

export async function getManualById(id: string): Promise<Manual | undefined> {
  return (await getManuals()).find((manual) => manual.id === id);
}

export async function listLibrary(): Promise<LibraryEntry[]> {
  const runtimeRoot = libraryManualsDir();
  const [{ manuals, errors }, dirs] = await Promise.all([runtimeLibrary(), listManualDirs(runtimeRoot)]);
  const runtimeById = new Map(manuals.map((manual) => [`${manual.domain}/${manual.id}`, withRuntimeThumbnail(manual)]));
  const errorById = new Map<string, string>();
  for (const error of errors) {
    const separator = error.indexOf(": ");
    const key = separator >= 0 ? error.slice(0, separator) : error;
    errorById.set(key, separator >= 0 ? error.slice(separator + 2) : error);
  }
  const builtinById = new Map(MANUALS.map((manual) => [`${manual.domain}/${manual.id}`, manual]));
  const entries = new Map<string, LibraryEntry>();
  for (const manual of MANUALS) {
    entries.set(`${manual.domain}/${manual.id}`, {
      domain: manual.domain,
      id: manual.id,
      source: "builtin",
      files: [manual.source.path.split("/").pop() ?? manual.source.path],
      status: "ok",
      manual,
    });
  }
  for (const dir of dirs) {
    const key = `${dir.domain}/${dir.id}`;
    const manual = runtimeById.get(key);
    const error = errorById.get(key);
    const hasPdf = dir.files.includes("source.pdf");
    const hasDraft = dir.files.includes("draft.json");
    const status = manual?.needsReview ? "needs review" : manual ? "ok" : hasDraft ? "draft" : hasPdf ? "pdf" : "error";
    entries.set(key, {
      domain: dir.domain,
      id: dir.id,
      source: "dropbox",
      files: dir.files,
      status,
      draft: hasDraft,
      ...(error ? { error } : {}),
      ...(manual ? { manual } : {}),
      ...(builtinById.has(key) ? { overridesBuiltin: true } : {}),
    });
  }
  return [...entries.values()].sort((a, b) => `${a.domain}/${a.id}`.localeCompare(`${b.domain}/${b.id}`));
}
