// promptfoo test generator: one test per eval/vision/<domain>/<case>/ directory.
// Filter with EVAL_DOMAIN=lego and/or EVAL_CASE=<id>.
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { DomainId } from "../../src/core/types";
import type { TruthItem } from "../../src/core/inventory-score";

const ROOT = path.resolve(process.cwd(), "../../eval/vision");
const DOMAINS: DomainId[] = ["lego", "breadboard", "fabric"];

export default async function cases() {
  const onlyDomain = process.env.EVAL_DOMAIN;
  const onlyCase = process.env.EVAL_CASE;
  const tests = [];
  for (const domain of DOMAINS) {
    if (onlyDomain && domain !== onlyDomain) continue;
    for (const c of (await readdir(path.join(ROOT, domain))).sort()) {
      if (onlyCase && c !== onlyCase) continue;
      const dir = path.join(ROOT, domain, c);
      if (!(await stat(dir)).isDirectory()) continue;
      const images = (await readdir(dir))
        .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
        .sort()
        .map((f) => path.join(dir, f));
      const truth: { items: TruthItem[]; note?: string } = JSON.parse(await readFile(path.join(dir, "truth.json"), "utf8"));
      tests.push({
        description: `${domain}/${c}`,
        // Arrays are JSON-encoded: promptfoo flattens array vars into comma-joined strings.
        vars: { domain, caseId: c, images: JSON.stringify(images), truth: JSON.stringify(truth.items), note: truth.note ?? "" },
      });
    }
  }
  return tests;
}
