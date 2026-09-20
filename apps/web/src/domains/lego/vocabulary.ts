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

  // --- 60486 Red Sports Car ---
  brick("7035", "Car chassis 4x14", "long black chassis base, 4 studs wide by 14 long, one brick tall with recessed middle"),
  low("6562", "Connector peg with cross axle", "small tan pin, one end a friction peg and the other a cross axle"),
  low("72206", "Wheel 24x12", "small black car wheel with rubber tyre, about 24mm across"),
  tile("15535", "Round tile 2x2 with hole", "flat round 2x2 tile with a centre hole, used as a hub cap"),
  plate("35480", "Plate 1x2 rounded", "1x2 plate with both ends rounded and two studs"),
  plate("3021", "Plate 2x3", "flat plate, 2 by 3 studs"),
  plate("5584", "Plate 2x4 (new mould)", "flat plate, 2 by 4 studs"),
  plate("78329", "Plate 1x5", "flat thin plate, 1 by 5 studs"),
  plate("6141", "Round plate 1x1", "tiny round plate, 1 stud across"),
  low("4304", "Plate 2x2x2/3 with 2 side studs", "2x2 plate two-thirds brick tall with two studs on one side face"),
  plate("41740", "Plate 1x4 with 2 side studs", "1x4 plate with two studs on one long side face"),
  brick("7674", "Bracket 1x2 with 2x2 plate", "1x2 plate with a 2x2 plate hanging straight down from one long edge"),
  low("99780", "Bracket 1x2 - 1x2 inverted", "1x2 plate with a 1x2 plate standing up from one long edge"),
  plate("44861", "Plate 1x2 with vertical grip", "1x2 plate with a small vertical clip on top"),
  plate("60478", "Plate 1x2 with handle on end", "1x2 plate with a bar sticking out of one short end"),
  plate("26601", "Wedge plate 2x2 cut corner", "2x2 plate with one corner cut off at 45 degrees"),
  plate("79491", "Plate 2x2 quarter circle with cut-out", "2x2 plate rounded into a quarter circle, one stud notched out"),
  low("7797", "Plate 4x6x2/3 half circle", "4-wide plate two-thirds brick tall with one end fully rounded"),
  tile("3070", "Tile 1x1", "tiny flat smooth square tile"),
  tile("6636", "Tile 1x6", "long flat smooth tile, 1 by 6 studs"),
  tile("63864", "Tile 1x3", "flat smooth tile, 1 by 3 studs"),
  tile("5091", "Tile 1x2 45 degree cut left", "1x2 flat tile with one end cut diagonally, left hand"),
  tile("5092", "Tile 1x2 45 degree cut right", "1x2 flat tile with one end cut diagonally, right hand"),
  tile("35787", "Tile 2x2 with 45 degree cut", "2x2 flat tile with one corner cut off diagonally"),
  tile("115971", "Tile 1x2 printed dashboard (trans light blue)", "translucent light blue 1x2 tile printed with a car dashboard screen"),
  tile("73893", "Tile 1x2 printed smartphone (dark blue)", "dark blue 1x2 tile printed with a phone screen"),
  tile("99563", "Ingot / license plate", "small flat 1x2 bar with bevelled edges"),
  brick("28192", "Slope 45 2x1 no studs", "1x2 brick with a 45 degree sloped face and no studs on top"),
  brick("6231", "Panel 1x1x1 corner", "1x1 brick with two thin walls forming a corner"),
  brick("73081", "Steering wheel console", "1x2 base with a small steering wheel on a post"),
  low("11477", "Slope curved 2x1", "low 1x2 brick whose top curves down to one end"),
  low("7302", "Brick 1x3x2/3 bow", "low 1x3 brick with a curved top sloping down along its length"),
  low("93606", "Slope curved 4x2", "low 2x4 brick whose top curves down along its length"),
  brick("80177", "Brick 2x3 outside bow left", "2x3 brick with a curved outer face, left hand"),
  brick("80178", "Brick 2x3 outside bow right", "2x3 brick with a curved outer face, right hand"),
  brick("64225", "Wedge 4x3 triple curved", "smooth 4x3 wedge curving down on three sides"),
  part("3387", "Mudguard 2x4x2", "two-brick-tall wheel arch, 2 studs wide by 4 long, with a semicircular cut-out underneath", 48),
  part("5378", "Windscreen 4x6x1 1/3", "translucent black sloped windscreen, 4 wide by 6 long", 32),
  part("73200", "Minifigure legs", "minifigure hips and legs", 32),
  part("76382", "Minifigure torso", "minifigure torso with arms and hands", 32),
  part("105777", "Minifigure head", "yellow minifigure head with printed face", 20),
  part("79688", "Minifigure hair", "minifigure hair piece", 12),
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
  3: "dark turquoise",
  40: "trans black",
  43: "trans light blue",
  272: "dark blue",
  378: "sand green",
  484: "dark orange",
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
