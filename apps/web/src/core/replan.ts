import { matchManual } from "./matcher";
import { fromMultiset, reqKey, toMultiset, type Multiset } from "./multiset";
import type { AppliedSub, Inventory, Manual, PartInstance, Requirement, Step, SubstitutionRule } from "./types";
import type { MatchOptions } from "./matcher";

export interface ReplanResult<P = unknown> {
  manual: Manual<P>;
  subs: AppliedSub[];
  unresolved: Requirement[];
  fromStep: number;
}

export function replan<P>(
  manual: Manual<P>,
  inventory: Inventory,
  completedThrough: number,
  missing: Requirement[],
  rules: SubstitutionRule<P>[],
  opts: MatchOptions,
): ReplanResult<P> {
  const remaining = toMultiset(inventory.items, opts.colorAware);
  for (const step of manual.steps.slice(0, completedThrough)) remove(remaining, step.callouts, opts.colorAware);
  remove(remaining, missing, opts.colorAware);

  const need = toMultiset(
    manual.steps.slice(completedThrough).flatMap((step) => step.callouts),
    opts.colorAware,
  );
  const matched = matchManual(
    { ...inventory, items: fromMultiset(remaining).map((r) => ({ ...r, conf: 1 })) },
    { ...manual, requires: fromMultiset(need) },
    rules,
    opts,
  );

  const steps = new Map<number, Step<P>>();
  const changed = new Set<number>();
  const parts = [...manual.parts];
  const emitted = new Map<string, AppliedSub>();

  for (const sub of matched.subs) {
    const rule = rules.find((candidate) => candidate.id === sub.ruleId);
    if (!rule || rule.produces.qty <= 0) continue;
    const instances = Math.floor(sub.produces.qty / rule.produces.qty);
    if (instances <= 0) continue;

    let allocated = 0;
    for (const candidate of candidatesFor(rule, manual.steps, steps, parts, completedThrough, opts.colorAware)) {
      if (allocated >= instances) break;
      const step = stepFor(candidate.step.n, manual.steps, steps);
      const index = step.add.indexOf(candidate.instance.id);
      if (index < 0) continue;

      if (rule.transform) {
        const newInstances = rule.transform(candidate.instance);
        const partIndex = parts.findIndex((part) => part.id === candidate.instance.id);
        if (partIndex >= 0) parts.splice(partIndex, 1, ...newInstances);
        step.add.splice(index, 1, ...newInstances.map((part) => part.id));
      }

      replaceCallout(step, candidate.instance, rule, opts.colorAware);
      const suffix = ` Substitution: ${rule.note}`;
      if (!step.text.includes(suffix)) step.text += suffix;
      if (!step.expected.description.includes(suffix)) step.expected.description += suffix;
      changed.add(step.n);

      const key = `${step.n}:${rule.id}`;
      const prior = emitted.get(key);
      if (prior) {
        prior.consumes = mergeRequirements(prior.consumes, scale(rule.consumes, 1));
        prior.produces = { ...prior.produces, qty: prior.produces.qty + rule.produces.qty };
      } else {
        emitted.set(key, {
          ruleId: rule.id,
          note: rule.note,
          consumes: scale(rule.consumes, 1),
          produces: { ...rule.produces, qty: rule.produces.qty },
          forStep: step.n,
        });
      }
      allocated++;
    }
  }

  const fromStep = [...changed].length > 0 ? Math.min(...changed) : completedThrough + 1;
  const colorAwareRequires = manual.requires.some((requirement) => requirement.color !== undefined);
  const nextManual: Manual<P> = {
    ...manual,
    parts,
    steps: manual.steps.map((step) => steps.get(step.n) ?? step),
    requires: fromMultiset(
      toMultiset(
        parts.map((part) => ({ partType: part.partType, color: part.color, qty: 1 })),
        colorAwareRequires,
      ),
    ),
  };

  return { manual: nextManual, subs: [...emitted.values()], unresolved: matched.missing, fromStep };
}

function remove(multiset: Multiset, requirements: Requirement[], colorAware: boolean) {
  for (const requirement of requirements) {
    const key = reqKey(requirement, colorAware);
    multiset.set(key, Math.max(0, (multiset.get(key) ?? 0) - requirement.qty));
  }
}

function stepFor<P>(n: number, original: Step<P>[], copies: Map<number, Step<P>>): Step<P> {
  const copy = copies.get(n);
  if (copy) return copy;
  const source = original[n - 1];
  const next = {
    ...source,
    add: [...source.add],
    callouts: source.callouts.map((callout) => ({ ...callout })),
    expected: { ...source.expected },
  };
  copies.set(n, next);
  return next;
}

function candidatesFor<P>(
  rule: SubstitutionRule<P>,
  original: Step<P>[],
  copies: Map<number, Step<P>>,
  parts: Manual<P>["parts"],
  completedThrough: number,
  colorAware: boolean,
) {
  const byId = new Map(parts.map((part) => [part.id, part]));
  const candidates: { step: Step<P>; instance: PartInstance<P> }[] = [];
  for (const source of original.slice(completedThrough).reverse()) {
    const step = copies.get(source.n) ?? source;
    for (const id of [...step.add].reverse()) {
      const instance = byId.get(id);
      if (
        instance &&
        instance.partType === rule.produces.partType &&
        (!colorAware || !rule.produces.color || instance.color === rule.produces.color)
      ) {
        candidates.push({ step, instance });
      }
    }
  }
  return candidates;
}

function replaceCallout<P>(step: Step<P>, instance: PartInstance<P>, rule: SubstitutionRule<P>, colorAware: boolean) {
  let index = step.callouts.findIndex(
    (callout) => callout.partType === instance.partType && !!callout.color && callout.color === instance.color,
  );
  if (index < 0) {
    index = step.callouts.findIndex((callout) => callout.partType === instance.partType);
  }
  if (index >= 0) {
    const callout = step.callouts[index];
    if (callout.qty <= 1) step.callouts.splice(index, 1);
    else step.callouts[index] = { ...callout, qty: callout.qty - 1 };
  }

  const consumes = rule.consumes.map((consume) => ({
    ...consume,
    color: colorAware ? instance.color : undefined,
  }));
  step.callouts = mergeRequirements(step.callouts, consumes);
}

function scale(requirements: Requirement[], factor: number): Requirement[] {
  return requirements.map((requirement) => ({ ...requirement, qty: requirement.qty * factor }));
}

function mergeRequirements(current: Requirement[], additions: Requirement[]): Requirement[] {
  const merged = current.map((requirement) => ({ ...requirement }));
  for (const addition of additions) {
    const index = merged.findIndex(
      (requirement) => requirement.partType === addition.partType && requirement.color === addition.color,
    );
    if (index >= 0) merged[index] = { ...merged[index], qty: merged[index].qty + addition.qty };
    else merged.push({ ...addition });
  }
  return merged;
}
