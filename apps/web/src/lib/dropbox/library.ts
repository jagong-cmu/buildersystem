import { promises as fs } from "node:fs";
import path from "node:path";
import type { DomainId } from "@/core/types";
import { DOMAIN_IDS } from "@/domains";
import { withRetry } from "./client";

const CACHE_ROOT = path.join(process.cwd(), ".cache", "dropbox");
const STATE_NAME = "state.json";
const MAX_FILE_SIZE = 25 * 1024 * 1024;

export interface LibraryEntry {
  ".tag": "file" | "folder" | "deleted";
  path_lower?: string;
  path_display?: string;
  rev?: string;
  name: string;
  size?: number;
}

export interface ListResult {
  entries: LibraryEntry[];
  cursor: string;
  has_more: boolean;
}

export interface LibraryClient {
  filesListFolder(arg: { path: string; recursive: boolean }): Promise<{ result: ListResult }>;
  filesListFolderContinue(arg: { cursor: string }): Promise<{ result: ListResult }>;
  filesListFolderGetLatestCursor(arg: { path: string; recursive: boolean }): Promise<{ result: { cursor: string } }>;
  filesDownload(arg: { path: string }): Promise<{ result: { fileBinary?: Buffer | Uint8Array; fileBlob?: { arrayBuffer(): Promise<ArrayBuffer> }; rev?: string } }>;
}

export interface SyncState {
  cursor: string | null;
  lastSync: number | null;
  files: Record<string, { rev: string; local: string }>;
}

export interface SyncSummary {
  added: string[];
  changed: string[];
  removed: string[];
  errors: string[];
  lastSync: number;
}

export function libraryManualsDir() {
  return path.join(CACHE_ROOT, "manuals");
}

function statePath(cacheDir: string) {
  return path.join(cacheDir, STATE_NAME);
}

export async function readSyncState(cacheDir = CACHE_ROOT): Promise<SyncState> {
  try {
    const parsed = JSON.parse(await fs.readFile(statePath(cacheDir), "utf8")) as Partial<SyncState>;
    return {
      cursor: typeof parsed.cursor === "string" ? parsed.cursor : null,
      lastSync: typeof parsed.lastSync === "number" ? parsed.lastSync : null,
      files: parsed.files && typeof parsed.files === "object" ? parsed.files : {},
    };
  } catch {
    return { cursor: null, lastSync: null, files: {} };
  }
}

async function writeSyncState(cacheDir: string, state: SyncState) {
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(statePath(cacheDir), JSON.stringify(state, null, 2));
}

function entryPath(entry: LibraryEntry) {
  return (entry.path_lower ?? entry.path_display ?? "").toLowerCase();
}

function resetCursorError(error: unknown) {
  const text = JSON.stringify(error).toLowerCase();
  return text.includes("reset") || text.includes("path/not_found") || text.includes("reset_required") || text.includes("expired");
}

function manualPath(root: string, remote: string) {
  const rootLower = root.toLowerCase().replace(/\/+$/, "");
  if (!remote.startsWith(`${rootLower}/`)) return null;
  const parts = remote.slice(rootLower.length + 1).split("/");
  if (parts.length !== 3 || !DOMAIN_IDS.includes(parts[0] as DomainId) || parts.some((part) => !part)) return null;
  return {
    domain: parts[0] as DomainId,
    id: parts[1],
    file: parts[2],
    local: path.join("manuals", parts[0], parts[1], parts[2]),
  };
}

async function listAll(client: LibraryClient, root: string, cursor: string | null) {
  let result: ListResult;
  let full = !cursor;
  if (cursor) {
    try {
      result = (await client.filesListFolderContinue({ cursor })).result;
    } catch (error) {
      if (!resetCursorError(error)) throw error;
      full = true;
      result = (await client.filesListFolder({ path: root, recursive: true })).result;
    }
  } else {
    result = (await client.filesListFolder({ path: root, recursive: true })).result;
  }
  const entries = [...result.entries];
  while (result.has_more) {
    result = (await client.filesListFolderContinue({ cursor: result.cursor })).result;
    entries.push(...result.entries);
  }
  return { entries, cursor: result.cursor, full };
}

async function removeLocal(cacheDir: string, local: string) {
  await fs.rm(path.join(cacheDir, local), { force: true });
}

export async function sync(client: LibraryClient, opts: { root: string; cacheDir?: string }): Promise<SyncSummary> {
  const cacheDir = opts.cacheDir ?? CACHE_ROOT;
  const manualsDir = path.join(cacheDir, "manuals");
  const previous = await readSyncState(cacheDir);
  let baselineCursor: string | null = null;
  if (!previous.cursor) {
    baselineCursor = (await client.filesListFolderGetLatestCursor({ path: opts.root, recursive: true })).result.cursor;
  }

  const listing = await listAll(client, opts.root, previous.cursor);
  if (listing.full && !previous.cursor && !baselineCursor) baselineCursor = listing.cursor;
  const nextFiles: Record<string, { rev: string; local: string }> = { ...previous.files };
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const entry of listing.entries) {
    const remote = entryPath(entry);
    if (!remote) continue;
    const mapped = manualPath(opts.root, remote);
    if (entry[".tag"] === "deleted") {
      const old = nextFiles[remote];
      if (old) {
        await removeLocal(cacheDir, old.local);
        delete nextFiles[remote];
        removed.push(remote);
      } else {
        const rootPrefix = opts.root.replace(/\/+$/, "").toLowerCase();
        const parts = remote.startsWith(`${rootPrefix}/`) ? remote.slice(rootPrefix.length + 1).split("/") : [];
        if (parts.length === 2 && DOMAIN_IDS.includes(parts[0] as DomainId)) {
          const dir = path.join(manualsDir, parts[0], parts[1]);
          await fs.rm(dir, { recursive: true, force: true });
          for (const key of Object.keys(nextFiles)) {
            if (key.startsWith(`${remote}/`)) {
              delete nextFiles[key];
              removed.push(key);
            }
          }
        }
      }
      continue;
    }
    if (entry[".tag"] !== "file" || !mapped || (entry.size !== undefined && entry.size > MAX_FILE_SIZE)) continue;
    seen.add(remote);
    const prior = nextFiles[remote];
    if (prior?.rev === entry.rev) {
      try {
        await fs.access(path.join(cacheDir, prior.local));
        continue;
      } catch {}
    }
    try {
      const downloaded = (await withRetry(() => client.filesDownload({ path: entry.path_display ?? remote }))).result;
      const bytes = downloaded.fileBinary ?? (downloaded.fileBlob ? new Uint8Array(await downloaded.fileBlob.arrayBuffer()) : undefined);
      if (!bytes) throw new Error("Dropbox file had no contents");
      const local = mapped.local;
      await fs.mkdir(path.dirname(path.join(cacheDir, local)), { recursive: true });
      await fs.writeFile(path.join(cacheDir, local), bytes);
      nextFiles[remote] = { rev: downloaded.rev ?? entry.rev ?? "", local };
      (prior ? changed : added).push(remote);
    } catch (error) {
      errors.push(`${remote}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (listing.full) {
    for (const [remote, info] of Object.entries(nextFiles)) {
      if (seen.has(remote)) continue;
      await removeLocal(cacheDir, info.local);
      delete nextFiles[remote];
      removed.push(remote);
    }
  }
  const lastSync = Date.now();
  await writeSyncState(cacheDir, { cursor: baselineCursor ?? listing.cursor, lastSync, files: nextFiles });
  return { added, changed, removed, errors, lastSync };
}
