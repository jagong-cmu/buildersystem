import type { AppliedSub, Inventory, Manual, Match, SubstitutionRule } from "./types";
import type { DomainPlugin } from "./plugin";
import { clone, fromMultiset, reqKey, subtract, toMultiset, total, type Multiset } from "./multiset";

export interface MatchOptions {
  /** When false, a red 2x4 satisfies a blue 2x4 (default for LEGO). */
  colorAware: boolean;
}

/**
 * PRD §11. Pure function: inventory + manual + rules → Match.
 * Substitution is single-level and greedy by penalty; quantities scale per rule application.
 */
export function matchManual(
  inventory: Inventory,
  manual: Manual,
  rules: SubstitutionRule[],
  opts: MatchOptions,
  plugin?: DomainPlugin,
): Match {
  const need = toMultiset(manual.requires, opts.colorAware);
  const have = toMultiset(inventory.items, opts.colorAware);
  const inventoryTotal = total(have);

  const remaining = clone(have);
  // Consume what we can directly.
  for (const [k, q] of need) {
    const avail = remaining.get(k) ?? 0;
    remaining.set(k, Math.max(0, avail - q));
  }
  let missing = subtract(need, have);

  const subs: AppliedSub[] = [];
  let penalty = 0;

  if (missing.size > 0) {
    const stillMissing: Multiset = new Map();
    // Largest shortfall first so big gaps get first pick of the inventory.
    const ordered = [...missing.entries()].sort((a, b) => b[1] - a[1]);
    for (const [key, qtyMissing] of ordered) {
      const partType = key.split("|")[0];
      let left = qtyMissing;
      const candidates = rules
        .filter((r) => r.produces.partType === partType)
        .sort((a, b) => a.penalty - b.penalty);
      for (const rule of candidates) {
        if (left <= 0) break;
        const perApp = rule.produces.qty;
        const wanted = Math.ceil(left / perApp);
        const canApply = maxApplications(rule, remaining, opts.colorAware);
        const apps = Math.min(wanted, canApply);
        if (apps <= 0) continue;
        for (const c of rule.consumes) {
          const ck = reqKey(c, opts.colorAware);
          remaining.set(ck, (remaining.get(ck) ?? 0) - c.qty * apps);
        }
        left -= apps * perApp;
        penalty += rule.penalty * apps;
        subs.push({
          ruleId: rule.id,
          note: rule.note,
          consumes: rule.consumes.map((c) => ({ ...c, qty: c.qty * apps })),
          produces: { ...rule.produces, qty: apps * perApp },
        });
      }
      if (left > 0) stillMissing.set(key, left);
    }
    missing = stillMissing;
  }

  const consumed = inventoryTotal - total(remaining);
  const utilization = inventoryTotal === 0 ? 0 : consumed / inventoryTotal;

  let status: Match["status"] = missing.size > 0 ? "missing" : subs.length > 0 ? "with-subs" : "buildable";

  let feasibility: Match["feasibility"];
  if (plugin?.feasibility) {
    const f = plugin.feasibility(inventory, manual);
    feasibility = { ok: f.ok, detail: f.detail };
    if (!f.ok && status !== "missing") status = "missing";
  }

  return {
    manualId: manual.id,
    status,
    subs,
    missing: fromMultiset(missing),
    utilization,
    penalty,
    feasibility,
  };
}

function maxApplications(rule: SubstitutionRule, remaining: Multiset, colorAware: boolean): number {
  let max = Infinity;
  for (const c of rule.consumes) {
    const avail = remaining.get(reqKey(c, colorAware)) ?? 0;
    max = Math.min(max, Math.floor(avail / c.qty));
  }
  return max === Infinity ? 0 : max;
}

const STATUS_ORDER: Record<Match["status"], number> = { buildable: 0, "with-subs": 1, missing: 2 };

/** Match every manual in a library and order them per PRD §11. */
export function rankManuals(
  inventory: Inventory,
  manuals: Manual[],
  rules: SubstitutionRule[],
  opts: MatchOptions,
  plugin?: DomainPlugin,
): Match[] {
  return manuals
    .filter((m) => m.domain === inventory.domain)
    .map((m) => matchManual(inventory, m, rules, opts, plugin))
    .sort((a, b) => {
      if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (a.status === "missing") return missingQty(a) - missingQty(b);
      if (b.utilization !== a.utilization) return b.utilization - a.utilization;
      return a.penalty - b.penalty;
    });
}

function missingQty(m: Match): number {
  return m.missing.reduce((s, r) => s + r.qty, 0);
}
