// pnpm manuals:index — parses every manual and writes src/generated/manuals.index.json.
// Fails (exit 1) on any parse error so a broken manual never reaches the UI silently.
import { promises as fs } from "node:fs";
import path from "node:path";
import { loadLibrary } from "../src/core/library";
import { getPlugin } from "../src/domains";
import { markerMatSvg } from "../src/lib/marker-mat";
import { markerSvg } from "../src/lib/aruco";

async function main() {
  const { manuals, errors } = await loadLibrary();
  const pubDir = path.resolve(process.cwd(), "public/manuals");
  for (const m of manuals) {
    const thumb = getPlugin(m.domain).thumbnailSvg;
    if (thumb) {
      const dir = path.join(pubDir, m.domain, m.id);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "thumb.svg"), thumb(m));
      m.thumbnail = `/manuals/${m.domain}/${m.id}/thumb.svg`;
    }
    const req = m.requires.map((r) => `${r.qty}×${r.partType.split(":")[1]}${r.color ? `(${r.color})` : ""}`).join(", ");
    console.log(`✔ ${m.domain}/${m.id}: ${m.steps.length} steps, ${m.parts.length} parts — ${req}`);
  }
  for (const e of errors) console.error(`✖ ${e}`);
  const outDir = path.resolve(process.cwd(), "src/generated");
  await fs.mkdir(outDir, { recursive: true });
  // Strip functions (none expected in Manual) and write.
  await fs.writeFile(path.join(outDir, "manuals.index.json"), JSON.stringify(manuals, null, 2));
  await fs.writeFile(path.resolve(process.cwd(), "public/marker-mat.svg"), markerMatSvg(markerSvg));
  console.log(`\n${manuals.length} manuals → src/generated/manuals.index.json, thumbnails → public/manuals/, mat → public/marker-mat.svg`);
  if (errors.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
