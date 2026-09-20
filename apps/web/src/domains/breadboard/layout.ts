// Breadboard geometry shared by the SVG renderer and the thumbnail. Node-safe.
import type { BoardPin, Hole } from "@/core/types";

export const W = 920, H = 520;
export const COL0 = 90, PITCH = 22, COLS = 30;
export const ROW_Y: Record<string, number> = { vcc: 40, gnd: 62, a: 120, b: 142, c: 164, d: 186, e: 208, f: 262, g: 284, h: 306, i: 328, j: 350 };
export const BOARD_Y = 470;
export const BOARD_PINS = ["5V", "3.3V", "GND", "VIN", "A0", "A1", "A2", "A3", "A4", "A5", "D13", "D12", "D11", "D10", "D9", "D8", "D7", "D6", "D5", "D4", "D3", "D2"];
export const BOARD_X0 = 90, BOARD_PITCH = 34;

export const WIRE_COLORS: Record<string, string> = { red: "#e5383b", black: "#222", yellow: "#f5c518", green: "#2ec27e", blue: "#3b82f6", white: "#eee", orange: "#ff8c42" };

export function holeXY(h: Hole): [number, number] {
  return [COL0 + (h.col - 1) * PITCH, ROW_Y[h.row] ?? 200];
}
export function boardXY(b: BoardPin): [number, number] {
  const name = /^\d+$/.test(b.board) ? `D${b.board}` : b.board;
  const i = Math.max(0, BOARD_PINS.indexOf(name));
  return [BOARD_X0 + i * BOARD_PITCH, BOARD_Y];
}
export function endXY(e: Hole | BoardPin): [number, number] {
  return "board" in e ? boardXY(e) : holeXY(e);
}

/** Multi-pin modules drawn as a labelled block spanning their pins (anything with its own PCB or a DIP package). */
const MODULE_LABELS: Record<string, string> = {
  "bb:ultrasonic_hcsr04": "HC-SR04",
  "bb:dht11": "DHT11",
  "bb:ir_receiver": "IR RX",
  "bb:joystick": "JOYSTICK",
  "bb:lcd1602": "LCD1602",
  "bb:relay_5v": "RELAY",
  "bb:ic_74hc595": "74HC595",
  "bb:ic_l293d": "L293D",
  "bb:seg7_1": "8",
  "bb:seg7_4": "8.8.8.8",
  "bb:servo_sg90": "SG90",
  "bb:uln2003": "ULN2003",
  "bb:stepper_28byj48": "28BYJ-48",
  "bb:dc_motor": "MOTOR",
  "bb:transistor_pn2222": "2N2222",
  "bb:diode_1n4007": "1N4007",
  "bb:power_module": "PSU",
};
export function moduleLabel(partType: string): string {
  return MODULE_LABELS[partType] ?? partType.replace(/^bb:/, "").toUpperCase();
}
export function moduleBox(partType: string, pts: [number, number][]): { x: number; y: number; w: number; h: number; fill: string } | null {
  if (!(partType in MODULE_LABELS)) return null;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys);
  const w = Math.max(maxX - minX + 28, 60);
  const fill = partType.startsWith("bb:ic_") || partType.startsWith("bb:seg7") || partType === "bb:transistor_pn2222" ? "#1c1c1c" : partType === "bb:relay_5v" ? "#2f5fb3" : "#1f5a78";
  return { x: (minX + maxX) / 2 - w / 2, y: minY - 46, w, h: 34, fill };
}

/** Cubic wire path between two endpoints, arching above the higher one. */
export function wirePath(from: Hole | BoardPin, to: Hole | BoardPin): string {
  const [x1, y1] = endXY(from);
  const [x2, y2] = endXY(to);
  const midY = Math.min(y1, y2) - 26;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}
