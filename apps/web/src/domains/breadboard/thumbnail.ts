// Final-state thumbnail (PRD §5.3): a simplified breadboard SVG using the renderer's layout math. Node-safe.
import type { BoardPlacement, Manual } from "@/core/types";
import { BOARD_PINS, BOARD_PITCH, BOARD_X0, BOARD_Y, COL0, COLS, H, PITCH, ROW_Y, W, WIRE_COLORS, endXY, holeXY, wirePath } from "./layout";

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

export function thumbnailSvg(manual: Manual<BoardPlacement>): string {
  const out: string[] = [];
  out.push(`<rect width="${W}" height="${H}" fill="#0f1318"/>`);
  out.push(`<rect x="${COL0 - 40}" y="20" width="${COLS * PITCH + 60}" height="360" rx="10" fill="#f1f1ec"/>`);
  out.push(`<line x1="${COL0 - 40}" y1="235" x2="${COL0 + COLS * PITCH + 20}" y2="235" stroke="#d8d8d0" stroke-width="8"/>`);
  for (const [row, c] of [["vcc", "#e5383b"], ["gnd", "#3b6cf6"]])
    out.push(`<line x1="${COL0 - 30}" y1="${ROW_Y[row] - 11}" x2="${COL0 + COLS * PITCH}" y2="${ROW_Y[row] - 11}" stroke="${c}" stroke-width="1.5"/>`);
  for (const y of Object.values(ROW_Y))
    for (let i = 0; i < COLS; i++) out.push(`<circle cx="${COL0 + i * PITCH}" cy="${y}" r="3.2" fill="#8f8f88"/>`);
  out.push(`<rect x="${BOARD_X0 - 30}" y="${BOARD_Y - 44}" width="${BOARD_PINS.length * BOARD_PITCH + 30}" height="74" rx="8" fill="#1d5c8a"/>`);
  BOARD_PINS.forEach((_, i) => out.push(`<rect x="${BOARD_X0 + i * BOARD_PITCH - 5}" y="${BOARD_Y - 5}" width="10" height="10" fill="#111"/>`));

  const parts = [...manual.parts].sort((a) => (a.placement.kind === "wire" ? -1 : 1));
  for (const p of parts) {
    const pl = p.placement;
    if (pl.kind === "wire") {
      const [x1, y1] = endXY(pl.from);
      const [x2, y2] = endXY(pl.to);
      const stroke = WIRE_COLORS[p.color ?? ""] ?? "#9ad";
      out.push(`<path d="${wirePath(pl.from, pl.to)}" fill="none" stroke="${esc(stroke)}" stroke-width="5" stroke-linecap="round"/>`);
      out.push(`<circle cx="${x1}" cy="${y1}" r="4" fill="#ccc"/><circle cx="${x2}" cy="${y2}" r="4" fill="#ccc"/>`);
      continue;
    }
    const pts = pl.pins.map(holeXY);
    if (!pts.length) continue;
    const [x1, y1] = pts[0];
    const [x2, y2] = pts[1] ?? pts[0];
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    for (const [x, y] of pts) out.push(`<circle cx="${x}" cy="${y}" r="4.5" fill="#bbb"/>`);
    if (p.partType.startsWith("bb:resistor")) {
      const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#999" stroke-width="3"/>`);
      out.push(`<g transform="translate(${cx} ${cy}) rotate(${ang.toFixed(1)})"><rect x="-22" y="-7" width="44" height="14" rx="5" fill="#d9c8a0" stroke="#7a6a45"/><rect x="-14" y="-7" width="4" height="14" fill="#e11"/><rect x="-5" y="-7" width="4" height="14" fill="#e11"/><rect x="4" y="-7" width="4" height="14" fill="#8b4513"/></g>`);
    } else if (p.partType.startsWith("bb:led")) {
      const fill = WIRE_COLORS[p.partType.replace("bb:led_", "")] ?? "#e33";
      out.push(`<line x1="${x1}" y1="${y1}" x2="${x1}" y2="${y1 - 18}" stroke="#999" stroke-width="3"/><line x1="${x2}" y1="${y2}" x2="${x2}" y2="${y2 - 14}" stroke="#999" stroke-width="3"/>`);
      out.push(`<circle cx="${cx}" cy="${y1 - 30}" r="14" fill="${esc(fill)}" stroke="#fff8"/>`);
    } else if (p.partType === "bb:photoresistor") {
      out.push(`<line x1="${x1}" y1="${y1}" x2="${cx - 10}" y2="${cy - 22}" stroke="#999" stroke-width="3"/><line x1="${x2}" y1="${y2}" x2="${cx + 10}" y2="${cy - 22}" stroke="#999" stroke-width="3"/>`);
      out.push(`<circle cx="${cx}" cy="${cy - 30}" r="15" fill="#e8d9b5" stroke="#8a6d3b"/>`);
    } else if (p.partType === "bb:pushbutton") {
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      out.push(`<rect x="${Math.min(...xs) - 8}" y="${Math.min(...ys) - 8}" width="${Math.max(...xs) - Math.min(...xs) + 16}" height="${Math.max(...ys) - Math.min(...ys) + 16}" rx="4" fill="#2b2b2b" stroke="#666"/>`);
      out.push(`<circle cx="${xs.reduce((s, v) => s + v, 0) / xs.length}" cy="${ys.reduce((s, v) => s + v, 0) / ys.length}" r="9" fill="#111" stroke="#888"/>`);
    } else if (p.partType === "bb:potentiometer" || p.partType === "bb:buzzer") {
      out.push(`<circle cx="${cx}" cy="${cy - 24}" r="14" fill="#333" stroke="#888"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${out.join("")}</svg>`;
}
