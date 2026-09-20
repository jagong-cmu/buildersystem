import { promises as fs } from "node:fs";
import path from "node:path";
import { getPlugin } from "../src/domains";
import { vocabularyIds } from "../src/core/plugin";
import { loadLibrary } from "../src/core/library";
import { getDropbox, rootPath, withRetry } from "../src/lib/dropbox/client";

type Section = "manuals" | "pdfs" | "photos";

const repoRoot = path.resolve(process.cwd(), "../..");
const seedRoot = path.join(repoRoot, "seed", "dropbox");
const manualsRoot = path.join(seedRoot, "Manuals");
const photosRoot = path.join(seedRoot, "Photos");
const selected = parseOnly(process.argv.slice(2));
const dryRun = process.argv.includes("--dry-run");

function parseOnly(args: string[]): Set<Section> {
  const value = args.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
  if (!value) return new Set(["manuals", "pdfs", "photos"]);
  if (!["manuals", "pdfs", "photos"].includes(value)) throw new Error(`Unknown --only value: ${value}`);
  return new Set([value as Section]);
}

function logPlan(remote: string, size?: number) {
  console.log(`${dryRun ? "plan" : "upload"} ${remote}${size === undefined ? "" : ` (${size} bytes)`}`);
}

async function upload(client: Awaited<ReturnType<typeof getDropbox>>, remote: string, contents: string | Uint8Array) {
  logPlan(remote, typeof contents === "string" ? Buffer.byteLength(contents) : contents.byteLength);
  if (!dryRun) {
    if (!client) throw new Error("Dropbox is not connected; set credentials in apps/web/.env.local");
    await withRetry(() => client.filesUpload({ path: rootPath(remote), contents, mode: { ".tag": "overwrite" } }));
  }
}

async function seedManuals() {
  const { manuals, errors } = await loadLibrary(manualsRoot);
  if (errors.length) throw new Error(`Seed manual validation failed:\n${errors.join("\n")}`);
  const manualById = new Map(manuals.map((manual) => [`${manual.domain}/${manual.id}`, manual]));
  const domains = await fs.readdir(manualsRoot, { withFileTypes: true });
  let count = 0;
  for (const domainEntry of domains.filter((entry) => entry.isDirectory())) {
    const domain = domainEntry.name;
    const ids = await fs.readdir(path.join(manualsRoot, domain), { withFileTypes: true });
    for (const idEntry of ids.filter((entry) => entry.isDirectory())) {
      const id = idEntry.name;
      const dir = path.join(manualsRoot, domain, id);
      const files = await fs.readdir(dir);
      if (files.includes("pdf.url")) continue;
      const manual = manualById.get(`${domain}/${id}`);
      if (!manual) throw new Error(`Validated seed manual missing: ${domain}/${id}`);
      const plugin = getPlugin(manual.domain);
      for (const name of files.filter((file) => file !== "thumb.svg")) {
        await upload(await getDropbox(), `/Manuals/${domain}/${id}/${name}`, await fs.readFile(path.join(dir, name)));
      }
      if (plugin.thumbnailSvg) {
        await upload(await getDropbox(), `/Manuals/${domain}/${id}/thumb.svg`, plugin.thumbnailSvg(manual));
      }
      const vocabulary = vocabularyIds(plugin);
      for (const part of manual.requires) {
        if (!vocabulary.includes(part.partType)) throw new Error(`${domain}/${id} requires non-vocabulary part ${part.partType}`);
      }
      count++;
    }
  }
  return count;
}

async function seedPdfs() {
  const tempRoot = path.join(repoRoot, "apps", "web", ".cache", "dropbox-seed");
  let count = 0;
  const domains = await fs.readdir(manualsRoot, { withFileTypes: true });
  for (const domainEntry of domains.filter((entry) => entry.isDirectory())) {
    const domain = domainEntry.name;
    const ids = await fs.readdir(path.join(manualsRoot, domain), { withFileTypes: true });
    for (const idEntry of ids.filter((entry) => entry.isDirectory())) {
      const id = idEntry.name;
      const dir = path.join(manualsRoot, domain, id);
      const urlPath = path.join(dir, "pdf.url");
      try {
        await fs.access(urlPath);
      } catch {
        continue;
      }
      const url = (await fs.readFile(urlPath, "utf8")).trim();
      const metadata = await fs.readFile(path.join(dir, "meta.json"));
      const pdfPath = path.join(tempRoot, domain, id, "source.pdf");
      let pdf: Uint8Array;
      if (dryRun) {
        pdf = new Uint8Array();
        console.log(`plan download ${url} → /Manuals/${domain}/${id}/source.pdf`);
      } else {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`PDF download failed (${response.status}): ${url}`);
        pdf = new Uint8Array(await response.arrayBuffer());
        await fs.mkdir(path.dirname(pdfPath), { recursive: true });
        await fs.writeFile(pdfPath, pdf);
      }
      await upload(await getDropbox(), `/Manuals/${domain}/${id}/meta.json`, metadata);
      await upload(await getDropbox(), `/Manuals/${domain}/${id}/pdf.url`, `${url}\n`);
      await upload(await getDropbox(), `/Manuals/${domain}/${id}/source.pdf`, pdf);
      count++;
    }
  }
  return count;
}

async function seedPhotos() {
  let count = 0;
  const domains = await fs.readdir(photosRoot, { withFileTypes: true });
  for (const domainEntry of domains.filter((entry) => entry.isDirectory())) {
    const domain = domainEntry.name;
    const sets = await fs.readdir(path.join(photosRoot, domain), { withFileTypes: true });
    for (const setEntry of sets.filter((entry) => entry.isDirectory())) {
      const set = setEntry.name;
      const manifest = JSON.parse(await fs.readFile(path.join(photosRoot, domain, set, "photos.json"), "utf8")) as string[];
      for (const relative of manifest) {
        const source = path.join(repoRoot, relative);
        const bytes = await fs.readFile(source);
        const label = `${path.basename(path.dirname(source))}-${path.basename(source)}`;
        await upload(await getDropbox(), `/Photos/${domain}/${set}/${label}`, bytes);
        count++;
      }
    }
  }
  return count;
}

async function main() {
  if (dryRun) console.log(`Dropbox seed dry-run from ${seedRoot}`);
  else if (!(await getDropbox())) throw new Error("Dropbox is not connected; set credentials in apps/web/.env.local");
  const counts: Record<string, number> = {};
  if (selected.has("manuals")) counts.manuals = await seedManuals();
  if (selected.has("pdfs")) counts.pdfs = await seedPdfs();
  if (selected.has("photos")) counts.photos = await seedPhotos();
  console.log(`Seed complete: ${JSON.stringify(counts)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
