import type { PartType } from "@/core/types";

/**
 * LEGO part vocabulary (ids are 'lego:<ldraw part number>'). The first block is the
 * set-independent basics; the second block is every element in the demo set,
 * LEGO Classic 11039 Creative Food Friends. Printed parts use their LEGO design id.
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

  // --- 11039 Creative Food Friends ---
  brick("3008", "Brick 1x8", "long thin brick, 1 stud wide by 8 studs long"),
  brick("3009", "Brick 1x6", "long thin brick, 1 stud wide by 6 studs long"),
  brick("35275", "Brick 2x2 (smooth inside)", "square 2x2 brick, usually transparent"),
  brick("110723", "Brick 1x2 printed smile (white)", "1x2 brick with a small printed smiling mouth on one long face"),
  brick("102701", "Brick 1x2 printed smile (lime)", "1x2 brick with a small printed smiling mouth on one long face"),
  brick("110721", "Brick 1x2 printed smile (coral)", "1x2 brick with a small printed smiling mouth on one long face"),
  brick("87087", "Brick 1x1 with side stud", "1x1 brick with one extra stud on a side face"),
  brick("86876", "Brick 1x2 with side stud", "1x2 brick with one extra stud centred on a long side face"),
  brick("11211", "Brick 1x2 with 2 side studs", "1x2 brick with two extra studs on a long side face"),
  plate("15573", "Jumper plate 1x2", "1x2 plate with a single centred stud on top"),
  plate("30565", "Plate 4x4 quarter circle", "flat plate, 4 by 4 studs with one corner rounded into a quarter circle"),
  brick("3941", "Round brick 2x2", "cylindrical brick, 2 studs in diameter, standard height"),
  plate("18674", "Round plate 2x2 with 1 stud", "flat round plate, 2 studs across, single centre stud"),
  plate("28626", "Round plate 1x1 open stud", "tiny round plate, 1 stud across, hollow stud"),
  tile("67095", "Round tile 3x3", "large flat smooth disc, 3 studs across"),
  tile("98138", "Round tile 1x1", "small flat smooth disc, 1 stud across"),
  tile("72399", "Round tile 1x1 printed (red)", "small flat red disc with a printed pattern"),
  tile("102576", "Round tile 1x1 printed eye A", "small white disc printed with an eye (design 224)"),
  tile("102577", "Round tile 1x1 printed eye B", "small white disc printed with an eye (design 223)"),
  tile("102702", "Round tile 1x1 printed eye C", "small white disc printed with an eye (design 225)"),
  tile("102763", "Round tile 1x1 printed eye D", "small white disc printed with an eye (design 226)"),
  tile("102764", "Round tile 1x1 printed eye E", "small white disc printed with an eye (design 227)"),
  tile("103032", "Round tile 1x1 printed eye F", "small white disc printed with an eye (design 229)"),
  tile("1748", "Tile 1x2 half circle", "flat smooth 1x2 tile with one rounded end"),
  tile("35399", "Tile 1x1 half circle", "flat smooth half-disc tile"),
  brick("3039", "Slope 45 2x2", "2x2 brick with a 45 degree sloped face"),
  brick("3660", "Slope inverted 45 2x2", "2x2 brick, flat top, underside angled at 45 degrees"),
  brick("3665", "Slope inverted 45 1x2", "1x2 brick, flat top, underside angled at 45 degrees"),
  low("85984", "Slope 30 1x2x2/3", "low 1x2 wedge with a 30 degree slope"),
  low("54200", "Slope 30 1x1x2/3", "tiny 1x1 wedge (cheese slope)"),
  brick("37352", "Brick 1x2 curved top", "1x2 brick whose top rounds down on one long side, no studs"),
  brick("7134", "Brick 1x2 bow", "1x2 curved brick, usually transparent"),
  brick("78666", "Arch 1x2 inverted", "1x2 brick with a curved cut-out underneath one end"),
  low("49307", "Brick 1x1x2/3 double curved", "small half-cylinder brick, no studs"),
  brick("3262", "Dome brick 2x2", "2x2 brick with a rounded dome top"),
  brick("59900", "Cone 1x1", "small cone, 1 stud across at the base"),
  brick("37762", "Candle", "thin white stick"),
  brick("25214", "Design shape with tube", "small white tube element"),
  brick("37775", "Flame", "small translucent orange flame"),
  plate("32607", "Plant plate 1x1 with 3 leaves", "round 1x1 plate with three flat leaves fanning out to one side"),
];

function part(num: string, name: string, hint: string, heightLdu: number): PartType {
  return { id: `lego:${num}`, domain: "lego", name, visionHint: `LEGO ${name}: ${hint}`, props: { heightLdu } };
}
function brick(num: string, name: string, hint: string): PartType {
  return part(num, name, hint, 24);
}
function low(num: string, name: string, hint: string): PartType {
  return part(num, name, hint, 16);
}
function plate(num: string, name: string, hint: string): PartType {
  return part(num, name, hint, 8);
}
function tile(num: string, name: string, hint: string): PartType {
  return part(num, name, hint, 8);
}

/** LDraw color code -> human color used in requirements and vision output. */
export const LDRAW_COLORS: Record<number, string> = {
  0: "black",
  1: "blue",
  2: "green",
  4: "red",
  10: "bright green",
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
  29: "bright pink",
  47: "trans clear",
  57: "trans orange",
  353: "coral",
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
