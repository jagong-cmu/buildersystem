import type { Manual, Requirement } from "./types";

/** Per-requirement running count: how many instances the steps so far have placed. */
export interface PartTally extends Requirement {
  /** Instances placed by steps 1..throughStep. */
  used: number;
  /** Instances placed by step `throughStep` alone. */
  usedThisStep: number;
  /** Instances still to place: qty − used, never negative. */
  left: number;
}

function matches(r: Requirement, p: { partType: string; color?: string }): boolean {
  return p.partType === r.partType && (r.color === undefined || p.color === r.color);
}

/** Tally each requirement against the parts introduced by steps 1..throughStep (0 = nothing placed). */
export function tallyParts(manual: Manual, throughStep: number): PartTally[] {
  const byId = new Map(manual.parts.map((p) => [p.id, p]));
  return manual.requires.map((r) => {
    let used = 0;
    let usedThisStep = 0;
    for (const step of manual.steps) {
      if (step.n > throughStep) break;
      for (const id of step.add) {
        const part = byId.get(id);
        if (!part || !matches(r, part)) continue;
        used++;
        if (step.n === throughStep) usedThisStep++;
      }
    }
    return { ...r, used, usedThisStep, left: Math.max(0, r.qty - used) };
  });
}
