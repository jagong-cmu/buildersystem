// Procedural brick dimensions and shapes shared by the 3D renderer and the SVG thumbnail.
// Add a row when a new part number appears in a manual.
//
// Local part frame (LDraw): origin on the top plane, +Y down, X = length, Z = depth.
// Sloped / curved parts always descend towards local +Z (the "front") and are extruded
// along X; rotate the reference in the .ldr to point the slope elsewhere.
// Side studs sit on the local +Z face.

/** studs along X, studs along Z, height in LDU. */
export const DIMS: Record<string, [number, number, number]> = {
  // plain bricks
  "3001": [4, 2, 24], "3003": [2, 2, 24], "3010": [4, 1, 24], "3004": [2, 1, 24], "3005": [1, 1, 24],
  "3008": [8, 1, 24], "3009": [6, 1, 24], "35275": [2, 2, 24],
  // printed 1x2 smile bricks (LEGO design ids)
  "110723": [2, 1, 24], "102701": [2, 1, 24], "110721": [2, 1, 24],
  // bricks with side studs
  "87087": [1, 1, 24], "86876": [2, 1, 24], "11211": [2, 1, 24],
  // plates
  "3034": [8, 2, 8], "3020": [4, 2, 8], "3022": [2, 2, 8], "3710": [4, 1, 8], "3023": [2, 1, 8],
  "15573": [2, 1, 8], "30565": [4, 4, 8],
  // round bricks / plates / tiles
  "3941": [2, 2, 24], "18674": [2, 2, 8], "28626": [1, 1, 8], "67095": [3, 3, 8],
  "98138": [1, 1, 8], "72399": [1, 1, 8],
  "102576": [1, 1, 8], "102577": [1, 1, 8], "102702": [1, 1, 8], "102763": [1, 1, 8], "102764": [1, 1, 8], "103032": [1, 1, 8],
  // tiles
  "1748": [2, 1, 8], "35399": [1, 1, 8],
  // slopes
  "3039": [2, 2, 24], "3660": [2, 2, 24], "3665": [1, 2, 24], "85984": [1, 2, 16], "54200": [1, 1, 16],
  // curved
  "37352": [2, 1, 24], "78666": [1, 2, 24], "49307": [1, 1, 16], "7134": [2, 1, 24], "3262": [2, 2, 24],
  // specials
  "59900": [1, 1, 24], "37762": [1, 1, 24], "37775": [1, 1, 24], "32607": [1, 1, 8], "25214": [1, 1, 24],
};
export const DEFAULT_DIMS: [number, number, number] = [2, 2, 24];

export type ShapeKind =
  | "box" // rectangular brick/plate/tile
  | "cylinder" // round brick/plate/tile: diameter = footprint
  | "quarter" // quarter-circle plate, corner at local (-X,-Z), arc towards +X+Z
  | "halfTile" // 1xN tile with a rounded +Z end
  | "slope" // 45° slope, high side at -Z
  | "slopeLow" // 30° low slope (2/3 brick), high side at -Z
  | "slopeInv" // inverted 45° slope: full top, underside cut away towards +Z
  | "curved" // quarter-round top, high side at -Z
  | "curvedInv" // inverted half arch: full top, underside arched away towards +Z
  | "halfCyl" // half cylinder along X (double-curved 1x1)
  | "dome" // 2x2 dome brick
  | "cone" // 1x1 nose cone
  | "rod" // thin candle stick
  | "flame" // candle flame
  | "plant"; // round plate 1x1 with three leaves fanning towards +Z

export type StudLayout = "grid" | "center" | "none";

export interface PartShape {
  kind: ShapeKind;
  studs: StudLayout;
  /** Studs on the local +Z face, centred on the part's X columns. */
  sideStuds?: number;
}

const BOX: PartShape = { kind: "box", studs: "grid" };

export const SHAPES: Record<string, PartShape> = {
  "110723": { kind: "box", studs: "grid" }, "102701": { kind: "box", studs: "grid" }, "110721": { kind: "box", studs: "grid" },
  "87087": { kind: "box", studs: "grid", sideStuds: 1 }, "86876": { kind: "box", studs: "grid", sideStuds: 1 }, "11211": { kind: "box", studs: "grid", sideStuds: 2 },
  "15573": { kind: "box", studs: "center" },
  "30565": { kind: "quarter", studs: "grid" },
  "3941": { kind: "cylinder", studs: "grid" }, "18674": { kind: "cylinder", studs: "center" }, "28626": { kind: "cylinder", studs: "center" },
  "67095": { kind: "cylinder", studs: "none" }, "98138": { kind: "cylinder", studs: "none" }, "72399": { kind: "cylinder", studs: "none" },
  "102576": { kind: "cylinder", studs: "none" }, "102577": { kind: "cylinder", studs: "none" }, "102702": { kind: "cylinder", studs: "none" },
  "102763": { kind: "cylinder", studs: "none" }, "102764": { kind: "cylinder", studs: "none" }, "103032": { kind: "cylinder", studs: "none" },
  "1748": { kind: "halfTile", studs: "none" }, "35399": { kind: "halfTile", studs: "none" },
  "3039": { kind: "slope", studs: "grid" }, "3660": { kind: "slopeInv", studs: "grid" }, "3665": { kind: "slopeInv", studs: "grid" },
  "85984": { kind: "slopeLow", studs: "none" }, "54200": { kind: "slopeLow", studs: "none" },
  "37352": { kind: "curved", studs: "none" }, "7134": { kind: "curved", studs: "none" }, "78666": { kind: "curvedInv", studs: "grid" },
  "49307": { kind: "halfCyl", studs: "none" }, "3262": { kind: "dome", studs: "none" },
  "59900": { kind: "cone", studs: "none" }, "37762": { kind: "rod", studs: "none" }, "25214": { kind: "rod", studs: "none" },
  "37775": { kind: "flame", studs: "none" }, "32607": { kind: "plant", studs: "center" },
};

export const COLORS: Record<number, string> = {
  0: "#1b1b1b", 1: "#0055bf", 2: "#237841", 4: "#c91a09", 10: "#4b9f4a", 14: "#f2cd37", 15: "#f4f4f4", 19: "#e4cd9e", 25: "#fe8a18",
  26: "#c870a0", 27: "#bbe90b", 29: "#e4adc8", 47: "#d8ecff", 57: "#f8bb3d", 70: "#582a12", 71: "#a0a5a9", 72: "#6c6e68",
  320: "#720e0f", 321: "#078bc9", 322: "#36aebf", 353: "#ff6d77",
};

/** LDraw colors that render translucent. */
export const TRANSLUCENT = new Set<number>([47, 57]);

export function dimsOf(part: string): [number, number, number] {
  return DIMS[part] ?? DEFAULT_DIMS;
}

export function shapeOf(part: string): PartShape {
  return SHAPES[part] ?? BOX;
}

/** Top-stud centres in the local frame (x, z), honouring the part's stud layout and outline. */
export function studPositions(part: string): [number, number][] {
  const [sx, sz] = dimsOf(part);
  const shape = shapeOf(part);
  if (shape.studs === "none") return [];
  if (shape.studs === "center") return [[0, 0]];
  const out: [number, number][] = [];
  for (let i = 0; i < sx; i++)
    for (let j = 0; j < sz; j++) {
      const x = -sx * 10 + 10 + i * 20, z = -sz * 10 + 10 + j * 20;
      if (shape.kind === "slope" && z > 0) continue; // sloped half has no studs
      if (shape.kind === "quarter" && Math.hypot(x + sx * 10, z + sz * 10) > sx * 20) continue; // outside the arc
      if (shape.kind === "cylinder" && Math.hypot(x, z) > sx * 10 - 6) continue;
      out.push([x, z]);
    }
  return out;
}

/** Side-stud centres in the local frame (x, y) on the +Z face. */
export function sideStudPositions(part: string): [number, number][] {
  const h = dimsOf(part)[2];
  const n = shapeOf(part).sideStuds ?? 0;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) out.push([-(n - 1) * 10 + i * 20, h / 2]);
  return out;
}
