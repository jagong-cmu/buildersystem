import type { PartType } from "@/core/types";

/**
 * Set-independent vocabulary: the bricks every set contains. Extend when the
 * demo set is known by adding rows here (ids are 'lego:<ldraw part number>').
 */
export const LEGO_PARTS: PartType[] = [
  brick("3001", "Brick 2x4", "rectangular brick, 2 studs wide by 4 studs long, standard height"),
  brick("3003", "Brick 2x2", "square brick, 2 by 2 studs, standard height"),
  brick("3010", "Brick 1x4", "thin brick, 1 stud wide by 4 studs long, standard height"),
  brick("3004", "Brick 1x2", "thin brick, 1 stud wide by 2 studs long, standard height"),
  brick("3005", "Brick 1x1", "single-stud cube brick"),
  plate("3034", "Plate 2x8", "flat plate, 2 studs wide by 8 studs long, one third brick height"),
  plate("3020", "Plate 2x4", "flat plate, 2 by 4 studs"),
  plate("3022", "Plate 2x2", "flat plate, 2 by 2 studs"),
  plate("3710", "Plate 1x4", "flat thin plate, 1 by 4 studs"),
  plate("3023", "Plate 1x2", "flat thin plate, 1 by 2 studs"),
];

function brick(num: string, name: string, hint: string): PartType {
  return { id: `lego:${num}`, domain: "lego", name, visionHint: `LEGO ${name}: ${hint}`, props: { heightLdu: 24 } };
}
function plate(num: string, name: string, hint: string): PartType {
  return { id: `lego:${num}`, domain: "lego", name, visionHint: `LEGO ${name}: ${hint}`, props: { heightLdu: 8 } };
}

/** LDraw color code -> human color used in requirements and vision output. */
export const LDRAW_COLORS: Record<number, string> = {
  0: "black",
  1: "blue",
  2: "green",
  4: "red",
  14: "yellow",
  15: "white",
  19: "tan",
  25: "orange",
  70: "reddish brown",
  71: "light gray",
  72: "dark gray",
  320: "dark red",
  321: "dark azure",
  322: "medium azure",
  26: "magenta",
  27: "lime",
};

export const COLOR_TO_LDRAW: Record<string, number> = Object.fromEntries(
  Object.entries(LDRAW_COLORS).map(([k, v]) => [v, Number(k)]),
);

export function colorName(code: number): string {
  return LDRAW_COLORS[code] ?? `ldraw-${code}`;
}

export function partName(partTypeId: string): string {
  return LEGO_PARTS.find((p) => p.id === partTypeId)?.name ?? partTypeId;
}
