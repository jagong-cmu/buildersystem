// Final-state thumbnail (PRD §5.3): the pattern pieces side by side. Node-safe.
import type { FabricPlacement, Manual } from "@/core/types";
import { bbox } from "./nesting";

const W = 320, H = 200, PAD = 16, GAP = 24;
const CLASS_COLOR: Record<string, string> = { "fab:cotton_woven": "#d98cb3", "fab:canvas": "#c9b58a", "fab:denim": "#4a6fa5", "fab:fleece": "#9ad0c2", "fab:knit": "#e8c170" };

type Piece = Extract<FabricPlacement, { kind: "piece" }>;

export function thumbnailSvg(manual: Manual<FabricPlacement>): string {
  const pieces = manual.parts.map((p) => p.placement).filter((p): p is Piece => p.kind === "piece");
  const boxes = pieces.map((p) => bbox(p.polygonMm));
  const totalW = boxes.reduce((s, b) => s + b.w, 0) + GAP * Math.max(0, boxes.length - 1);
  const maxH = Math.max(1, ...boxes.map((b) => b.h));
  const scale = Math.min((W - 2 * PAD) / Math.max(1, totalW), (H - 2 * PAD) / maxH);
  const ox = (W - totalW * scale) / 2;
  const oy = (H - maxH * scale) / 2;

  const out: string[] = [`<rect width="${W}" height="${H}" fill="#0f1318"/>`];
  let x0 = 0;
  pieces.forEach((p, i) => {
    const b = boxes[i];
    const minX = Math.min(...p.polygonMm.map(([x]) => x));
    const minY = Math.min(...p.polygonMm.map(([, y]) => y));
    const pts = p.polygonMm.map(([x, y]) => `${(ox + (x0 + x - minX) * scale).toFixed(1)},${(oy + (maxH - b.h + y - minY) * scale).toFixed(1)}`).join(" ");
    out.push(`<polygon points="${pts}" fill="${CLASS_COLOR[p.fabricClass] ?? "#777777"}" stroke="#ffffff88" stroke-width="1.5" stroke-linejoin="round"/>`);
    x0 += b.w + GAP;
  });
  const notions = manual.parts.filter((p) => p.placement.kind === "notion").length;
  if (notions) out.push(`<text x="${W - PAD}" y="${H - 6}" font-size="11" text-anchor="end" fill="#8b97a5" font-family="sans-serif">+${notions} notion${notions > 1 ? "s" : ""}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${out.join("")}</svg>`;
}
