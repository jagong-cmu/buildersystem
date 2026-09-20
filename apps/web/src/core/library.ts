// Node-only: reads manuals/<domain>/<id>/ from disk into normalized Manuals.
// Never import this from client components; use the generated index instead.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ManualInput } from "./plugin";
import type { DomainId, Manual } from "./types";
import { DOMAIN_IDS, getPlugin } from "@/domains";

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
        manuals.push(getPlugin(domain).loadManual(input));
      } catch (e) {
        errors.push(`${domain}/${id}: ${(e as Error).message}`);
      }
    }
  }
  return { manuals, errors };
}
