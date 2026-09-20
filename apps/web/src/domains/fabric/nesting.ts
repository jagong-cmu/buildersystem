// Rectangle nesting (guillotine, first-fit, largest-first). PRD §13.3 MVP.
// Pieces and scraps are reduced to their bounding boxes; upgrade to SVGnest for polygons.

export interface Rect {
  w: number;
  h: number;
}
export interface PieceReq extends Rect {
  id: string;
  fabricClass: string;
}
export interface Scrap extends Rect {
  id: string;
  fabricClass: string;
}
export interface Placement {
  pieceId: string;
  scrapId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
}

export function bbox(polygon: [number, number][]): Rect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of polygon) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { w: maxX - minX, h: maxY - minY };
}

interface Free {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function nest(
  pieces: PieceReq[],
  scraps: Scrap[],
  compatible: (required: string, available: string) => boolean,
): { ok: boolean; detail: string; placements: Placement[] } {
  const free = new Map<string, Free[]>(scraps.map((s) => [s.id, [{ x: 0, y: 0, w: s.w, h: s.h }]]));
  const placements: Placement[] = [];
  const ordered = [...pieces].sort((a, b) => b.w * b.h - a.w * a.h);

  for (const piece of ordered) {
    let placed = false;
    for (const scrap of scraps) {
      if (!compatible(piece.fabricClass, scrap.fabricClass)) continue;
      const rects = free.get(scrap.id)!;
      for (let i = 0; i < rects.length && !placed; i++) {
        const f = rects[i];
        const fits = piece.w <= f.w && piece.h <= f.h;
        const fitsRot = piece.h <= f.w && piece.w <= f.h;
        if (!fits && !fitsRot) continue;
        const rotated = !fits;
        const w = rotated ? piece.h : piece.w;
        const h = rotated ? piece.w : piece.h;
        placements.push({ pieceId: piece.id, scrapId: scrap.id, x: f.x, y: f.y, w, h, rotated });
        rects.splice(i, 1);
        // Guillotine split: right remainder (full height) and bottom remainder (piece width).
        if (f.w - w > 0) rects.push({ x: f.x + w, y: f.y, w: f.w - w, h: f.h });
        if (f.h - h > 0) rects.push({ x: f.x, y: f.y + h, w, h: f.h - h });
        placed = true;
      }
      if (placed) break;
    }
    if (!placed) {
      return {
        ok: false,
        detail: `Piece "${piece.id}" (${Math.round(piece.w)}×${Math.round(piece.h)} mm, ${piece.fabricClass}) does not fit on any scrap.`,
        placements,
      };
    }
  }
  return { ok: true, detail: `All ${pieces.length} pieces fit.`, placements };
}
