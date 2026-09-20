// Node-only: reads manuals/<domain>/<id>/ from disk into normalized Manuals.
// Never import this from client components; use the generated index instead.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ManualInput } from "./plugin";
import type { DomainId, Manual } from "./types";
import { DOMAIN_IDS, getPlugin } from "@/domains";
import { loadDocumentManual } from "./document";

export function manualsRoot(): string {
  // apps/web -> repo root
  return process.env.MANUALS_DIR ?? path.resolve(process.cwd(), "../../manuals");
}

export async function readManualInput(domain: DomainId, id: string, root = manualsRoot()): Promise<ManualInput> {
  const dirAbs = path.join(root, domain, id);
  const names = (await fs.readdir(dirAbs)).filter((n) => !n.startsWith("."));
  const files: Record<string, string> = {};
  for (const n of names) {
    if (/\.(ldr|mpd|json|ino|txt|md)$/i.test(n)) files[n] = await fs.readFile(path.join(dirAbs, n), "utf8");
  }
  const meta = files["meta.json"] ? JSON.parse(files["meta.json"]) : { title: id, description: "", estMinutes: 5 };
  return { id, dir: `manuals/${domain}/${id}`, meta, files };
}

export async function listManualDirs(root = manualsRoot()): Promise<{ domain: DomainId; id: string; files: string[] }[]> {
  const result: { domain: DomainId; id: string; files: string[] }[] = [];
  for (const domain of DOMAIN_IDS) {
    const domDir = path.join(root, domain);
    let ids: string[] = [];
    try {
      ids = (await fs.readdir(domDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      continue;
    }
    for (const id of ids.sort()) {
      let files: string[] = [];
      try {
        files = (await fs.readdir(path.join(domDir, id), { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
      } catch {}
      result.push({ domain, id, files });
    }
  }
  return result;
}

export async function loadLibrary(root = manualsRoot()): Promise<{ manuals: Manual[]; errors: string[] }> {
  const manuals: Manual[] = [];
  const errors: string[] = [];
  for (const domain of DOMAIN_IDS) {
    const domDir = path.join(root, domain);
    let ids: string[] = [];
    try {
      ids = (await fs.readdir(domDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      continue;
    }
    for (const id of ids.sort()) {
      try {
        const input = await readManualInput(domain, id, root);
        if (input.files["ingested.json"]) manuals.push(loadDocumentManual(input));
        else {
          const names = await fs.readdir(path.join(root, domain, id));
          if (names.includes("source.pdf") || names.includes("pdf.url")) continue;
          manuals.push(getPlugin(domain).loadManual(input));
        }
      } catch (e) {
        errors.push(`${domain}/${id}: ${(e as Error).message}`);
      }
    }
  }
  return { manuals, errors };
}
