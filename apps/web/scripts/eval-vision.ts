// Vision inventory eval: runs labelled images through the same prompt/schema as /api/inventory and scores them.
//
//   pnpm --filter web eval:vision [--domain lego] [--case <id>] [--model google/gemini-3.6-flash]
//                                 [--set curated|feedback|all] [--no-exemplars] [--baseline] [--fail-below 0.8]
// (script = `node --env-file=.env.local` + tsx, run from apps/web)
//
// Layout: eval/vision/<domain>/<case>/{*.jpg|png, truth.json}            (curated set)
//         eval/vision/feedback/<domain>/<id>/{image.jpg, truth.json}      (user corrections saved from /scan)
//   truth.json = { "items": [{ "partType": "lego:3001", "color": "red", "qty": 2 }], "note": "optional" }
// Feedback cases are scored with the same few-shot exemplars the app uses, minus the case itself.
// --baseline writes eval/vision/baseline.json; later runs print the delta and --fail-below <f1> exits 1 on regression.
// Scoring key = partType (+ ":" + color when the truth item has a color).
//   - key P/R/F1 over the set of keys (present at all)
//   - qty accuracy: fraction of truth keys with exact qty; qty MAE over matched keys
// Writes eval/vision/results-<timestamp>.json alongside a console table.
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { getPlugin } from "../src/domains";
import type { DomainId } from "../src/core/types";
import { inventoryPrompt, inventorySchema } from "../src/core/inventory";
import { scoreInventory, type TruthItem } from "../src/core/inventory-score";
import { VISION_MODEL, visionObject } from "../src/lib/vision";
import { exemplarParts } from "../src/core/feedback";
import { FEEDBACK_ROOT, loadExemplars } from "../src/lib/feedback";

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
const set = (flag("set") ?? "all") as "curated" | "feedback" | "all";
const failBelow = flag("fail-below") ? Number(flag("fail-below")) : undefined;
const writeBaseline = args.includes("--baseline");
if (args.includes("--no-exemplars")) process.env.VISION_EXEMPLARS = "0";
if (flag("model")) process.env.VISION_MODEL = flag("model");

const DOMAINS: DomainId[] = ["lego", "breadboard", "fabric"];
const BASELINE = path.join(ROOT, "baseline.json");

type Case = { domain: DomainId; id: string; dir: string; set: "curated" | "feedback" };

async function listCases(): Promise<Case[]> {
  const out: Case[] = [];
  const scan = async (root: string, which: Case["set"]) => {
    for (const domain of DOMAINS) {
      if (onlyDomain && domain !== onlyDomain) continue;
      let ids: string[] = [];
      try {
        ids = (await readdir(path.join(root, domain))).sort();
      } catch {
        continue;
      }
      for (const id of ids) {
        if (onlyCase && id !== onlyCase) continue;
        const dir = path.join(root, domain, id);
        if (!(await stat(dir)).isDirectory()) continue;
        out.push({ domain, id, dir, set: which });
      }
    }
  };
  if (set !== "feedback") await scan(ROOT, "curated");
  if (set !== "curated") await scan(FEEDBACK_ROOT, "feedback");
  return out;
}

async function main() {
  const results: Record<string, unknown>[] = [];
  for (const { domain, id: c, dir, set: which } of await listCases()) {
    const plugin = getPlugin(domain);
    const files = (await readdir(dir)).filter((f) => (which === "feedback" ? f === "image.jpg" : /\.(jpe?g|png|webp)$/i.test(f))).sort();
    const exemplars = await loadExemplars(domain, which === "feedback" ? { exclude: c } : {});
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
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const out = await visionObject({
          schema: inventorySchema(plugin),
          system: inventoryPrompt(plugin),
          prefix: exemplarParts(exemplars),
          text: images.length > 1 ? `These ${images.length} photos show the same table from different angles. Report each part once.` : "Identify the parts on the table.",
          images,
        });
        pred = out.items;
        error = undefined;
        break;
      } catch (e) {
        error = (e as Error).message;
        const m = /retry in ([\d.]+)s/i.exec(error);
        if (!/quota|429|rate/i.test(error)) break;
        const waitMs = m ? Math.ceil(Number(m[1]) * 1000) + 1000 : 30_000 * (attempt + 1);
        console.log(`   rate limited, waiting ${Math.round(waitMs / 1000)}s`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
    const s = scoreInventory(truth.items, pred, domain);
    results.push({ domain, case: c, set: which, exemplars: exemplars.length, images: files.length, ms: Date.now() - t0, error, ...s, pred, truth: truth.items });
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    console.log(
      `${which === "feedback" ? "fb:" : ""}${domain}/${c}`.padEnd(40),
      error ? `ERROR ${error.slice(0, 80)}` : `P ${pct(s.precision)}  R ${pct(s.recall)}  F1 ${pct(s.f1)}  qty✓ ${pct(s.qtyExact)}  MAE ${s.qtyMae?.toFixed(2) ?? "-"}  ${Date.now() - t0}ms`,
    );
    if (s.missing.length) console.log("   missing:", s.missing.join(", "));
    if (s.extra.length) console.log("   extra:  ", s.extra.join(", "));
  }
  const ok = results.filter((r) => !r.error) as { f1: number; recall: number; precision: number; qtyExact: number }[];
  const mean = (k: keyof (typeof ok)[number]) => (ok.length ? ok.reduce((a, r) => a + r[k], 0) / ok.length : 0);
  const summary = {
    model: process.env.VISION_MODEL ?? VISION_MODEL,
    set,
    exemplars: process.env.VISION_EXEMPLARS !== "0",
    at: new Date().toISOString(),
    cases: results.length,
    errors: results.length - ok.length,
    meanPrecision: mean("precision"),
    meanRecall: mean("recall"),
    meanF1: mean("f1"),
    meanQtyExact: mean("qtyExact"),
  };
  console.log("\nSUMMARY", JSON.stringify(summary, null, 1));
  const outFile = path.join(ROOT, `results-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(outFile, JSON.stringify({ summary, results }, null, 2));
  console.log("wrote", outFile);

  if (writeBaseline) {
    await writeFile(BASELINE, JSON.stringify(summary, null, 2));
    console.log("wrote baseline", BASELINE);
  } else {
    const base = await readFile(BASELINE, "utf8")
      .then((s) => JSON.parse(s) as typeof summary)
      .catch(() => null);
    if (base) {
      const d = (k: "meanPrecision" | "meanRecall" | "meanF1" | "meanQtyExact") => `${k} ${(summary[k] * 100).toFixed(0)}% (${summary[k] - base[k] >= 0 ? "+" : ""}${((summary[k] - base[k]) * 100).toFixed(1)} vs baseline)`;
      console.log("VS BASELINE", [d("meanPrecision"), d("meanRecall"), d("meanF1"), d("meanQtyExact")].join("  "));
    }
  }
  if (failBelow !== undefined && summary.meanF1 < failBelow) {
    console.error(`FAIL: mean F1 ${(summary.meanF1 * 100).toFixed(1)}% is below ${(failBelow * 100).toFixed(0)}%`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
