import type { BoardPlacement, SubstitutionRule } from "@/core/types";
import { RESISTOR_VALUES, resistorId, ohmsLabel } from "./vocabulary";

const TOLERANCE = 0.1;

/**
 * Generated at startup from the E12 subset: any series or parallel pair of
 * vocabulary values within ±10% of a target value substitutes for it.
 */
export function generateResistorSubs(): SubstitutionRule<BoardPlacement>[] {
  const rules: SubstitutionRule<BoardPlacement>[] = [];
  const within = (x: number, target: number) => Math.abs(x - target) / target <= TOLERANCE;
  for (const target of RESISTOR_VALUES) {
    for (let i = 0; i < RESISTOR_VALUES.length; i++) {
      for (let j = i; j < RESISTOR_VALUES.length; j++) {
        const a = RESISTOR_VALUES[i];
        const b = RESISTOR_VALUES[j];
        const consumes =
          a === b ? [{ partType: resistorId(a), qty: 2 }] : [{ partType: resistorId(a), qty: 1 }, { partType: resistorId(b), qty: 1 }];
        const series = a + b;
        if (series !== target && within(series, target)) {
          rules.push({
            id: `bb:series:${a}+${b}->${target}`,
            domain: "breadboard",
            consumes,
            produces: { partType: resistorId(target), qty: 1 },
            penalty: 1,
            note: `${ohmsLabel(a)} + ${ohmsLabel(b)} in series ≈ ${ohmsLabel(target)} (${ohmsLabel(series)}).`,
          });
        }
        const parallel = (a * b) / (a + b);
        if (within(parallel, target)) {
          rules.push({
            id: `bb:parallel:${a}||${b}->${target}`,
            domain: "breadboard",
            consumes,
            produces: { partType: resistorId(target), qty: 1 },
            penalty: 1.5,
            note: `${ohmsLabel(a)} ∥ ${ohmsLabel(b)} in parallel ≈ ${ohmsLabel(target)} (${Math.round(parallel)}Ω).`,
          });
        }
      }
    }
  }
  return rules;
}

const LED_COLORS = ["red", "green", "yellow", "blue"];

export function generateLedSubs(): SubstitutionRule<BoardPlacement>[] {
  const rules: SubstitutionRule<BoardPlacement>[] = [];
  for (const want of LED_COLORS)
    for (const have of LED_COLORS) {
      if (want === have) continue;
      rules.push({
        id: `bb:led:${have}-for-${want}`,
        domain: "breadboard",
        consumes: [{ partType: `bb:led_${have}`, qty: 1 }],
        produces: { partType: `bb:led_${want}`, qty: 1 },
        penalty: 1,
        note: `A ${have} LED works in place of ${want}; the series resistor stays within safe current at 5 V.`,
      });
    }
  return rules;
}

export const BREADBOARD_SUBS: SubstitutionRule<BoardPlacement>[] = [...generateResistorSubs(), ...generateLedSubs()];
