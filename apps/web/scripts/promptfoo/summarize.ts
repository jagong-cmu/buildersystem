// Summarize a promptfoo results JSON (from `pnpm eval:promptfoo`) as mean metrics per model x prompt,
// overall and per domain.   tsx scripts/promptfoo/summarize.ts ../../eval/vision/results-promptfoo.json
import { readFile } from "node:fs/promises";

type Row = {
  provider: { label?: string; id: string };
  prompt: { label: string };
  vars: { domain: string; caseId: string };
  error?: string | null;
  latencyMs?: number;
  gradingResult?: { namedScores?: Record<string, number>; reason?: string } | null;
};

type Metric = "precision" | "recall" | "f1" | "qtyExact" | "qtyMae";
const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(5);

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: summarize.ts <results.json>");
  const data = JSON.parse(await readFile(file, "utf8")) as { results: { results: Row[] } };
  const rows = data.results.results;
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.provider.label ?? r.provider.id} | ${r.prompt.label.split(":").pop()}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  // promptfoo also sets `error` to the assertion reason when a case fails; a real provider error has no scores.
  const scored = (r: Row) => !!r.gradingResult?.namedScores;
  const line = (label: string, rs: Row[]) => {
    const ok = rs.filter(scored);
    const mean = (m: Metric) => (ok.length ? ok.reduce((a, r) => a + (r.gradingResult!.namedScores![m] ?? 0), 0) / ok.length : 0);
    const lat = ok.length ? ok.reduce((a, r) => a + (r.latencyMs ?? 0), 0) / ok.length : 0;
    return `${label.padEnd(48)} n=${String(ok.length).padStart(2)}/${String(rs.length).padEnd(2)} P ${pct(mean("precision"))} R ${pct(mean("recall"))} F1 ${pct(mean("f1"))} qty✓ ${pct(mean("qtyExact"))} MAE ${mean("qtyMae").toFixed(2)} ${Math.round(lat / 1000)}s`;
  };
  for (const [k, rs] of groups) {
    console.log(line(k, rs));
    for (const d of ["lego", "breadboard", "fabric"]) {
      const sub = rs.filter((r) => r.vars.domain === d);
      if (sub.length) console.log("  " + line(d, sub));
    }
    const errs = rs.filter((r) => !scored(r));
    if (errs.length) console.log(`  errors: ${errs.map((r) => `${r.vars.domain}/${r.vars.caseId}: ${String(r.error).slice(0, 60)}`).join("; ")}`);
    const bad = rs.filter((r) => scored(r) && (r.gradingResult!.namedScores!.f1 ?? 0) < 0.5);
    if (bad.length) console.log(`  low F1: ${bad.map((r) => `${r.vars.domain}/${r.vars.caseId}: ${String(r.gradingResult!.reason).slice(0, 90)}`).join("; ")}`);
  }
  console.log("\nPer case (F1 by model|prompt):");
  const byCase = new Map<string, Map<string, string>>();
  for (const r of rows) {
    const c = `${r.vars.domain}/${r.vars.caseId}`;
    const k = `${r.provider.label ?? r.provider.id}|${r.prompt.label.split(":").pop()}`;
    const v = scored(r) ? pct(r.gradingResult!.namedScores!.f1 ?? 0) : "ERR";
    byCase.set(c, (byCase.get(c) ?? new Map()).set(k, v));
  }
  const keys = [...groups.keys()].map((k) => k.replace(" | ", "|"));
  console.log("".padEnd(32) + keys.map((k) => k.slice(-22).padStart(24)).join(""));
  for (const [c, m] of byCase) console.log(c.padEnd(32) + keys.map((k) => (m.get(k) ?? "-").padStart(24)).join(""));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
