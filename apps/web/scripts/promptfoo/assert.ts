// promptfoo javascript assertion: scores the provider's items against vars.truth with the same
// scorer as scripts/eval-vision.ts. Score = F1; qty metrics are exposed as named scores.
import type { DomainId } from "../../src/core/types";
import { scoreInventory, type PredItem, type TruthItem } from "../../src/core/inventory-score";

type AssertContext = { vars: { domain: DomainId; truth: string } };

export default function assertInventory(output: string, context: AssertContext) {
  const pred = JSON.parse(output) as PredItem[];
  const truth = JSON.parse(context.vars.truth) as TruthItem[];
  const s = scoreInventory(truth, pred, context.vars.domain);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const parts = [`P ${pct(s.precision)} R ${pct(s.recall)} F1 ${pct(s.f1)} qty✓ ${pct(s.qtyExact)} MAE ${s.qtyMae?.toFixed(2) ?? "-"}`];
  if (s.missing.length) parts.push(`missing: ${s.missing.join(", ")}`);
  if (s.extra.length) parts.push(`extra: ${s.extra.join(", ")}`);
  return {
    pass: s.f1 >= 0.5,
    score: s.f1,
    reason: parts.join(" | "),
    namedScores: { precision: s.precision, recall: s.recall, f1: s.f1, qtyExact: s.qtyExact, qtyMae: s.qtyMae ?? 0 },
  };
}
