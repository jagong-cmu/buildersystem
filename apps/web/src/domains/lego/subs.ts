import type { LegoPlacement, PartInstance, SubstitutionRule } from "@/core/types";
import { mulVec } from "./ldraw";

/** Split one long part into two half-length parts placed end to end along its local X axis. */
function splitAlongX(halfPart: string, offsetLdu: number) {
  return (inst: PartInstance<LegoPlacement>): PartInstance<LegoPlacement>[] => {
    const p = inst.placement;
    const dx = mulVec(p.rot, [offsetLdu, 0, 0]);
    return [-1, 1].map((sign, i) => ({
      ...inst,
      id: `${inst.id}.${i}`,
      partType: `lego:${halfPart}`,
      placement: {
        ...p,
        ldrawPart: halfPart,
        pos: [p.pos[0] + sign * dx[0], p.pos[1] + sign * dx[1], p.pos[2] + sign * dx[2]],
      },
    }));
  };
}

export const LEGO_SUBS: SubstitutionRule<LegoPlacement>[] = [
  {
    id: "lego:2x2x2-for-2x4",
    domain: "lego",
    consumes: [{ partType: "lego:3003", qty: 2 }],
    produces: { partType: "lego:3001", qty: 1 },
    penalty: 1,
    note: "Two 2x2 bricks side by side replace a 2x4 (stagger the row above).",
    transform: splitAlongX("3003", 20),
  },
  {
    id: "lego:2x1x2-for-1x4",
    domain: "lego",
    consumes: [{ partType: "lego:3004", qty: 2 }],
    produces: { partType: "lego:3010", qty: 1 },
    penalty: 1,
    note: "Two 1x2 bricks end to end replace a 1x4.",
    transform: splitAlongX("3004", 20),
  },
  {
    id: "lego:2x1x2plate-for-1x4plate",
    domain: "lego",
    consumes: [{ partType: "lego:3023", qty: 2 }],
    produces: { partType: "lego:3710", qty: 1 },
    penalty: 1,
    note: "Two 1x2 plates end to end replace a 1x4 plate.",
    transform: splitAlongX("3023", 20),
  },
  {
    id: "lego:2x2x4plate-for-2x8plate",
    domain: "lego",
    consumes: [{ partType: "lego:3020", qty: 2 }],
    produces: { partType: "lego:3034", qty: 1 },
    penalty: 2,
    note: "Two 2x4 plates end to end replace a 2x8 plate (weaker: no overlap).",
    transform: splitAlongX("3020", 40),
  },
];
