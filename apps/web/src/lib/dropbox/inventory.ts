import type { DomainId, Inventory, InventoryItem } from "@/core/types";
import { makeInventory, mergeFrames } from "@/core/inventory";
import { detectInventory } from "@/lib/inventory-service";
import { downscaleIfLarge } from "@/lib/images";
import { rootPath, withRetry } from "./client";

export interface DropboxEntry {
  ".tag": "file" | "folder";
  name: string;
  path_lower?: string;
  path_display?: string;
  client_modified?: string;
}

export interface DropboxListResult {
  entries: DropboxEntry[];
  cursor?: string;
  has_more?: boolean;
}

export interface InventoryClient {
  filesListFolder(arg: { path: string; recursive: boolean }): Promise<{ result: DropboxListResult }>;
  filesListFolderContinue?(arg: { cursor: string }): Promise<{ result: DropboxListResult }>;
  filesDownload(arg: { path: string }): Promise<{ result: { fileBinary?: Buffer | Uint8Array; fileBlob?: { arrayBuffer(): Promise<ArrayBuffer> } } }>;
  filesUpload(arg: { path: string; contents: string | Uint8Array; mode?: { ".tag": "overwrite" } }): Promise<unknown>;
}

export interface Photo {
  path: string;
  capturedAt?: string;
}

export interface PhotoFolder {
  path: string;
  count: number;
}

export interface PersistedInventory {
  domain: DomainId;
  items: InventoryItem[];
  sources: { path: string; capturedAt?: string }[];
  updatedAt: string;
}

function entryPath(entry: DropboxEntry) {
  return entry.path_display ?? entry.path_lower ?? "";
}

function isPhoto(entry: DropboxEntry) {
  return /\.(?:jpe?g|png|webp|heic)$/i.test(entry.name);
}

export async function listPhotoFolders(client: InventoryClient, domain: DomainId): Promise<PhotoFolder[]> {
  const root = rootPath(`/Photos/${domain}`);
  const listed = (await withRetry(() => client.filesListFolder({ path: root, recursive: false }))).result;
  const folders = [{ path: root, count: 0 }];
  for (const entry of listed.entries) {
    if (entry[".tag"] === "folder") folders.push({ path: entryPath(entry), count: 0 });
  }
  for (const folder of folders) {
    folder.count = (await listPhotos(client, folder.path)).length;
  }
  return folders;
}

export async function listPhotos(client: InventoryClient, folder: string): Promise<Photo[]> {
  const listed = (await withRetry(() => client.filesListFolder({ path: folder, recursive: true }))).result;
  const entries = [...listed.entries];
  let result = listed;
  while (result.has_more && result.cursor && client.filesListFolderContinue) {
    result = (await withRetry(() => client.filesListFolderContinue!({ cursor: result.cursor! }))).result;
    entries.push(...result.entries);
  }
  return entries
    .filter((entry) => entry[".tag"] === "file" && isPhoto(entry))
    .map((entry) => ({ path: entryPath(entry), ...(entry.client_modified ? { capturedAt: entry.client_modified } : {}) }));
}

export async function downloadPhoto(client: InventoryClient, path: string): Promise<Uint8Array> {
  const result = (await withRetry(() => client.filesDownload({ path }))).result;
  if (result.fileBinary) return new Uint8Array(result.fileBinary);
  if (result.fileBlob) return new Uint8Array(await result.fileBlob.arrayBuffer());
  throw new Error("Dropbox photo had no contents");
}

export function toPersisted(inv: Inventory): PersistedInventory {
  return {
    domain: inv.domain,
    items: inv.items,
    sources: inv.dropbox?.sources ?? [],
    updatedAt: inv.dropbox?.updatedAt ?? inv.capturedAt,
  };
}

export function fromPersisted(persisted: PersistedInventory): Inventory {
  return {
    domain: persisted.domain,
    items: persisted.items,
    capturedAt: persisted.updatedAt,
    sourceId: "dropbox",
    frameSeqs: [],
    dropbox: { sources: persisted.sources, updatedAt: persisted.updatedAt },
  };
}

export async function readInventory(client: InventoryClient, domain: DomainId): Promise<Inventory | null> {
  try {
    const result = (await withRetry(() => client.filesDownload({ path: rootPath(`/Inventory/${domain}.json`) }))).result;
    const bytes = result.fileBinary ?? (result.fileBlob ? new Uint8Array(await result.fileBlob.arrayBuffer()) : undefined);
    if (!bytes) throw new Error("Dropbox inventory had no contents");
    return fromPersisted(JSON.parse(new TextDecoder().decode(bytes)) as PersistedInventory);
  } catch (error) {
    if (JSON.stringify(error).toLowerCase().includes("not_found")) return null;
    throw error;
  }
}

export async function writeInventory(client: InventoryClient, domain: DomainId, persisted: PersistedInventory) {
  const path = rootPath(`/Inventory/${domain}.json`);
  await withRetry(() => client.filesUpload({ path, contents: JSON.stringify(persisted, null, 2), mode: { ".tag": "overwrite" } }));
  return { path, updatedAt: persisted.updatedAt };
}

export interface PhotoScanResult {
  path: string;
  items: InventoryItem[];
  scaled: boolean;
  capturedAt?: string;
  error?: string;
}

export async function scanPhotoFolder(
  client: InventoryClient,
  domain: DomainId,
  folder: string,
  mode: "same-pile" | "different-bins",
): Promise<{ perPhoto: PhotoScanResult[]; merged: Inventory }> {
  const photos = await listPhotos(client, folder);
  const perPhoto: PhotoScanResult[] = [];
  for (const photo of photos) {
    if (/\.heic$/i.test(photo.path)) {
      perPhoto.push({ path: photo.path, items: [], scaled: false, capturedAt: photo.capturedAt, error: "HEIC not supported, export as JPEG" });
      continue;
    }
    try {
      const bytes = await downloadPhoto(client, photo.path);
      const image = await downscaleIfLarge(bytes);
      const inventory = await detectInventory(domain, [image], photo.path);
      perPhoto.push({ path: photo.path, items: inventory.items, scaled: image.scaled, capturedAt: photo.capturedAt });
    } catch (error) {
      perPhoto.push({ path: photo.path, items: [], scaled: false, capturedAt: photo.capturedAt, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const updatedAt = new Date().toISOString();
  const merged = makeInventory(domain, mergeFrames(perPhoto.filter((photo) => !photo.error).map((photo) => photo.items), mode), "dropbox");
  merged.dropbox = {
    sources: perPhoto.filter((photo) => !photo.error).map(({ path, capturedAt }) => ({ path, ...(capturedAt ? { capturedAt } : {}) })),
    updatedAt,
  };
  return { perPhoto, merged };
}
