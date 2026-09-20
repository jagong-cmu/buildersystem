// Procedural brick dimensions shared by the 3D renderer and the SVG thumbnail.
// Add a row when a new part number appears in a manual.

/** studs along X, studs along Z, height in LDU. */
export const DIMS: Record<string, [number, number, number]> = {
  "3001": [4, 2, 24], "3003": [2, 2, 24], "3010": [4, 1, 24], "3004": [2, 1, 24], "3005": [1, 1, 24],
  "3034": [8, 2, 8], "3020": [4, 2, 8], "3022": [2, 2, 8], "3710": [4, 1, 8], "3023": [2, 1, 8],
};
export const DEFAULT_DIMS: [number, number, number] = [2, 2, 24];

export const COLORS: Record<number, string> = {
  0: "#1b1b1b", 1: "#0055bf", 2: "#237841", 4: "#c91a09", 14: "#f2cd37", 15: "#f4f4f4", 19: "#e4cd9e", 25: "#fe8a18",
  26: "#c870a0", 27: "#bbe90b", 70: "#582a12", 71: "#a0a5a9", 72: "#6c6e68", 320: "#720e0f", 321: "#078bc9", 322: "#36aebf",
};

export function dimsOf(part: string): [number, number, number] {
  return DIMS[part] ?? DEFAULT_DIMS;
}
