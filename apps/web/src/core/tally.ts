import type { Manual, Requirement } from "./types";

/** Per-requirement running count: how many instances the steps so far have placed. */
export interface PartTally extends Requirement {
  /** Instances the whole build places: max(qty, placed instances). */
  total: number;
  /** Instances placed by steps 1..throughStep. */
  used: number;
  /** Instances placed by step `throughStep` alone. */
  usedThisStep: number;
  /** Instances still to place: total − used, never negative. */
  left: number;
}

function matches(r: Requirement, p: { partType: string; color?: string }): boolean {
  return p.partType === r.partType && (r.color === undefined || p.color === r.color);
}

/**
 * Tally each requirement against the parts introduced by steps 1..throughStep (0 = nothing placed).
 * Parts no step introduces (a board, thread, the base) count as in use from step 1.
 * If the manual places more instances than the requirement lists (fabric: scraps vs pieces), total reflects the placed count.
 */
export function tallyParts(manual: Manual, throughStep: number): PartTally[] {
  const byId = new Map(manual.parts.map((p) => [p.id, p]));
  const introduced = new Set(manual.steps.flatMap((s) => s.add));
  const implicitStep = manual.steps.length > 0 ? 1 : 0;
  return manual.requires.map((r) => {
    let used = 0;
    let usedThisStep = 0;
    let placed = 0;
    for (const step of manual.steps) {
      for (const id of step.add) {
        const part = byId.get(id);
        if (!part || !matches(r, part)) continue;
        placed++;
        if (step.n > throughStep) continue;
        used++;
        if (step.n === throughStep) usedThisStep++;
      }
    }
    for (const part of manual.parts) {
      if (introduced.has(part.id) || !matches(r, part)) continue;
      placed++;
      if (implicitStep > 0 && throughStep >= implicitStep) {
        used++;
        if (throughStep === implicitStep) usedThisStep++;
      }
    }
    const total = Math.max(r.qty, placed);
    return { ...r, total, used, usedThisStep, left: Math.max(0, total - used) };
  });
}
