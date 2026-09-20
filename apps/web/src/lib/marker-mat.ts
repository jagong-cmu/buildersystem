// Marker mat + homography math (PRD §9): four ArUco markers at known mm positions → pixel→mm mapping.
// Pure TypeScript, no DOM; used by ScrapMeasure in the browser and by the index script to emit marker-mat.svg.

export type Pt = [number, number];
/** Row-major 3×3. */
export type Homography = [number, number, number, number, number, number, number, number, number];

/** A3 landscape, 40 mm markers (ARUCO_MIP_36h12 ids 0–3) with a 15 mm margin, clockwise from top-left. */
export const MAT = {
  widthMm: 420,
  heightMm: 297,
  markerMm: 40,
  marginMm: 15,
  dictionary: "ARUCO_MIP_36h12",
  ids: [0, 1, 2, 3] as const,
};

/** Centre of marker `id` on the mat, in mm from the mat's top-left corner. */
export function markerCenterMm(id: number): Pt {
  const c = MAT.marginMm + MAT.markerMm / 2;
  const r = MAT.widthMm - c, b = MAT.heightMm - c;
  return ([[c, c], [r, c], [r, b], [c, b]] as Pt[])[id];
}

/** Marker corners in mm, clockwise from top-left (matches js-aruco2's canonical corner order). */
export function markerCornersMm(id: number): Pt[] {
  const [cx, cy] = markerCenterMm(id);
  const h = MAT.markerMm / 2;
  return [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]];
}

/** Solve a dense linear system by Gaussian elimination with partial pivoting. */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) throw new Error("degenerate point configuration");
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

function normalize(pts: Pt[]): { t: Homography; pts: Pt[] } {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  const d = pts.reduce((s, p) => s + Math.hypot(p[0] - mx, p[1] - my), 0) / n || 1;
  const s = Math.SQRT2 / d;
  return { t: [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1], pts: pts.map(([x, y]) => [s * (x - mx), s * (y - my)]) };
}

function mul(a: Homography, b: Homography): Homography {
  const r = new Array(9).fill(0) as Homography;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
}

function invert(h: Homography): Homography {
  const [a, b, c, d, e, f, g, hh, i] = h;
  const A = e * i - f * hh, B = -(d * i - f * g), C = d * hh - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error("singular homography");
  return [A / det, -(b * i - c * hh) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * hh - b * g) / det, (a * e - b * d) / det];
}

/**
 * Least-squares homography mapping src[i] → dst[i] (DLT with Hartley normalisation, h33 = 1).
 * Needs ≥ 4 non-collinear correspondences.
 */
export function findHomography(src: Pt[], dst: Pt[]): Homography {
  if (src.length < 4 || src.length !== dst.length) throw new Error("need at least 4 point pairs");
  const ns = normalize(src), nd = normalize(dst);
  // Rows of A·h = b with h = [h11..h32], h33 = 1.
  const rows: number[][] = [], rhs: number[] = [];
  for (let k = 0; k < src.length; k++) {
    const [x, y] = ns.pts[k], [u, v] = nd.pts[k];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); rhs.push(u);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]); rhs.push(v);
  }
  // Normal equations (8×8).
  const ata: number[][] = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const atb = new Array(8).fill(0);
  for (let r = 0; r < rows.length; r++)
    for (let i = 0; i < 8; i++) {
      atb[i] += rows[r][i] * rhs[r];
      for (let j = 0; j < 8; j++) ata[i][j] += rows[r][i] * rows[r][j];
    }
  const h = solve(ata, atb);
  const hn: Homography = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  const out = mul(mul(invert(nd.t), hn), ns.t);
  return out.map((v) => v / out[8]) as Homography;
}

export function applyHomography(h: Homography, [x, y]: Pt): Pt {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

/** Homography from frame pixels to mat millimetres, given detected markers (id + 4 pixel corners, clockwise from TL). */
export function matHomography(markers: { id: number; corners: Pt[] }[]): Homography | null {
  const src: Pt[] = [], dst: Pt[] = [];
  const seen = new Set<number>();
  for (const m of markers) {
    if (!(MAT.ids as readonly number[]).includes(m.id) || seen.has(m.id) || m.corners.length !== 4) continue;
    seen.add(m.id);
    const mm = markerCornersMm(m.id);
    m.corners.forEach((c, i) => { src.push(c); dst.push(mm[i]); });
  }
  if (seen.size < 4) return null;
  return findHomography(src, dst);
}

/** Shoelace area (mm²) and axis-aligned size of a polygon. */
export function polygonStats(poly: Pt[]): { areaMm2: number; wMm: number; hMm: number } {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  return { areaMm2: Math.abs(a) / 2, wMm: Math.max(...xs) - Math.min(...xs), hMm: Math.max(...ys) - Math.min(...ys) };
}

/**
 * Printable A3 mat: four markers at the corners plus a 10 mm grid and a legend.
 * `markerSvg(id)` returns js-aruco2's marker SVG plus the black square's side in SVG units
 * (the SVG has a 1-unit white quiet zone around the black square).
 */
export function markerMatSvg(markerSvg: (id: number) => { svg: string; size: number }): string {
  const { widthMm: W, heightMm: H, markerMm: M } = MAT;
  const grid: string[] = [];
  for (let x = 0; x <= W; x += 10) grid.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${x % 50 ? "#e5e5e5" : "#c8c8c8"}" stroke-width="${x % 50 ? 0.15 : 0.3}"/>`);
  for (let y = 0; y <= H; y += 10) grid.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${y % 50 ? "#e5e5e5" : "#c8c8c8"}" stroke-width="${y % 50 ? 0.15 : 0.3}"/>`);
  const markers = MAT.ids.map((id) => {
    const [[x, y]] = markerCornersMm(id);
    const { svg, size } = markerSvg(id);
    const inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    const s = M / size;
    return `<g transform="translate(${x - s} ${y - s}) scale(${s})">${inner}</g><text x="${x + M / 2}" y="${y + M + 6}" font-size="4" text-anchor="middle" fill="#666" font-family="sans-serif">id ${id}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="white"/>${grid.join("")}${markers.join("")}<text x="${W / 2}" y="${H / 2 - 4}" font-size="8" text-anchor="middle" fill="#999" font-family="sans-serif">Reality Compiler · scrap mat</text><text x="${W / 2}" y="${H / 2 + 6}" font-size="5" text-anchor="middle" fill="#999" font-family="sans-serif">Print on A3 at 100 % (no scaling). Grid 10 mm. Markers ${MAT.dictionary} ${M} mm.</text></svg>`;
}
