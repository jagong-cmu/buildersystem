// Vision inventory eval: runs labelled images through the same prompt/schema as /api/inventory and scores them.
//
//   pnpm --filter web eval:vision [--domain lego] [--case <id>] [--model google/gemini-2.5-flash]
// (script = `node --env-file=.env.local` + tsx, run from apps/web)
//
// Layout: eval/vision/<domain>/<case>/{*.jpg|png, truth.json}
//   truth.json = { "items": [{ "partType": "lego:3001", "color": "red", "qty": 2 }], "note": "optional" }
// Scoring key = partType (+ ":" + color when the truth item has a color).
//   - key P/R/F1 over the set of keys (present at all)
//   - qty accuracy: fraction of truth keys with exact qty; qty MAE over matched keys
// Writes eval/vision/results-<timestamp>.json alongside a console table.
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { getPlugin } from "../src/domains";
import type { DomainId } from "../src/core/types";
import { inventoryPrompt, inventorySchema } from "../src/core/inventory";
import { VISION_MODEL, visionObject } from "../src/lib/vision";

type TruthItem = { partType: string; color?: string; qty: number };
type Truth = { items: TruthItem[]; note?: string };
type Pred = { partType: string; color?: string; qty: number; conf: number };

const ROOT = path.resolve(process.cwd(), "../../eval/vision");
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const onlyDomain = flag("domain") as DomainId | undefined;
const onlyCase = flag("case");
if (flag("model")) process.env.VISION_MODEL = flag("model");

const keyOf = (it: { partType: string; color?: string }, useColor: boolean) =>
  useColor && it.color ? `${it.partType}:${it.color.toLowerCase().trim()}` : it.partType;

function score(truth: TruthItem[], pred: Pred[], domain: DomainId) {
  const useColor = domain === "lego";
  const t = new Map<string, number>();
  for (const it of truth) t.set(keyOf(it, useColor), (t.get(keyOf(it, useColor)) ?? 0) + it.qty);
  const p = new Map<string, number>();
  for (const it of pred) p.set(keyOf(it, useColor), (p.get(keyOf(it, useColor)) ?? 0) + it.qty);
  const tp = [...t.keys()].filter((k) => p.has(k)).length;
  const precision = p.size ? tp / p.size : 0;
  const recall = t.size ? tp / t.size : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  let exact = 0;
  let absErr = 0;
  for (const [k, q] of t) {
    const pq = p.get(k);
    if (pq === undefined) continue;
    if (pq === q) exact++;
    absErr += Math.abs(pq - q);
  }
  return {
    precision,
    recall,
    f1,
    qtyExact: t.size ? exact / t.size : 0,
    qtyMae: tp ? absErr / tp : null,
    missing: [...t.keys()].filter((k) => !p.has(k)),
    extra: [...p.keys()].filter((k) => !t.has(k)),
  };
}

async function main() {
  const domains = (await readdir(ROOT)).filter((d) => ["lego", "breadboard", "fabric"].includes(d)) as DomainId[];
  const results: Record<string, unknown>[] = [];
  for (const domain of domains) {
    if (onlyDomain && domain !== onlyDomain) continue;
    const plugin = getPlugin(domain);
    const cases = (await readdir(path.join(ROOT, domain))).sort();
    for (const c of cases) {
      if (onlyCase && c !== onlyCase) continue;
      const dir = path.join(ROOT, domain, c);
      if (!(await stat(dir)).isDirectory()) continue;
      const files = (await readdir(dir)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
      const truth: Truth = JSON.parse(await readFile(path.join(dir, "truth.json"), "utf8"));
      const images = await Promise.all(
        files.map(async (f) => ({
          data: new Uint8Array(await readFile(path.join(dir, f))),
          mediaType: f.toLowerCase().endsWith(".png") ? "image/png" : f.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg",
        })),
      );
      const t0 = Date.now();
      let pred: Pred[] = [];
      let error: string | undefined;
      try {
        const out = await visionObject({
          schema: inventorySchema(plugin),
          system: inventoryPrompt(plugin),
          text: images.length > 1 ? `These ${images.length} photos show the same table from different angles. Report each part once.` : "Identify the parts on the table.",
          images,
        });
        pred = out.items;
      } catch (e) {
        error = (e as Error).message;
      }
      const s = score(truth.items, pred, domain);
      results.push({ domain, case: c, images: files.length, ms: Date.now() - t0, error, ...s, pred, truth: truth.items });
      const pct = (x: number) => `${Math.round(x * 100)}%`;
      console.log(
        `${domain}/${c}`.padEnd(40),
        error ? `ERROR ${error.slice(0, 80)}` : `P ${pct(s.precision)}  R ${pct(s.recall)}  F1 ${pct(s.f1)}  qty✓ ${pct(s.qtyExact)}  MAE ${s.qtyMae?.toFixed(2) ?? "-"}  ${Date.now() - t0}ms`,
      );
      if (s.missing.length) console.log("   missing:", s.missing.join(", "));
      if (s.extra.length) console.log("   extra:  ", s.extra.join(", "));
    }
  }
  const ok = results.filter((r) => !r.error) as { f1: number; recall: number; precision: number; qtyExact: number }[];
  const mean = (k: keyof (typeof ok)[number]) => (ok.length ? ok.reduce((a, r) => a + r[k], 0) / ok.length : 0);
  const summary = { model: process.env.VISION_MODEL ?? VISION_MODEL, cases: results.length, errors: results.length - ok.length, meanPrecision: mean("precision"), meanRecall: mean("recall"), meanF1: mean("f1"), meanQtyExact: mean("qtyExact") };
  console.log("\nSUMMARY", JSON.stringify(summary, null, 1));
  const outFile = path.join(ROOT, `results-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(outFile, JSON.stringify({ summary, results }, null, 2));
  console.log("wrote", outFile);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
