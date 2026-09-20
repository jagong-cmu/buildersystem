// pnpm manuals:index — parses every manual and writes src/generated/manuals.index.json.
// Fails (exit 1) on any parse error so a broken manual never reaches the UI silently.
import { promises as fs } from "node:fs";
import path from "node:path";
import { loadLibrary } from "../src/core/library";

async function main() {
  const { manuals, errors } = await loadLibrary();
  for (const m of manuals) {
    const req = m.requires.map((r) => `${r.qty}×${r.partType.split(":")[1]}${r.color ? `(${r.color})` : ""}`).join(", ");
    console.log(`✔ ${m.domain}/${m.id}: ${m.steps.length} steps, ${m.parts.length} parts — ${req}`);
  }
  for (const e of errors) console.error(`✖ ${e}`);
  const outDir = path.resolve(process.cwd(), "src/generated");
  await fs.mkdir(outDir, { recursive: true });
  // Strip functions (none expected in Manual) and write.
  await fs.writeFile(path.join(outDir, "manuals.index.json"), JSON.stringify(manuals, null, 2));
  console.log(`\n${manuals.length} manuals → src/generated/manuals.index.json`);
  if (errors.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
