// Final-state thumbnail (PRD §5.3): an isometric 2D projection of the procedural bricks, no WebGL.
// Node-safe (used by scripts/index-manuals.ts) — never import React or three here.
import type { LegoPlacement, Manual } from "@/core/types";
import { COLORS, dimsOf, studPositions } from "./dims";

type V3 = [number, number, number];

const SIZE = 240;
const PAD = 14;
/** Direction towards the camera in LDraw space (-Y is up): from +X, above, +Z. */
const VIEW: V3 = [1, -1.1, 1];
const LIGHT: V3 = norm([0.5, -1, 0.3]);

function norm(v: V3): V3 {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function apply(p: LegoPlacement, v: V3): V3 {
  const r = p.rot;
  return [
    r[0] * v[0] + r[1] * v[1] + r[2] * v[2] + p.pos[0],
    r[3] * v[0] + r[4] * v[1] + r[5] * v[2] + p.pos[1],
    r[6] * v[0] + r[7] * v[1] + r[8] * v[2] + p.pos[2],
  ];
}
function rotate(p: LegoPlacement, v: V3): V3 {
  const r = p.rot;
  return [r[0] * v[0] + r[1] * v[1] + r[2] * v[2], r[3] * v[0] + r[4] * v[1] + r[5] * v[2], r[6] * v[0] + r[7] * v[1] + r[8] * v[2]];
}

/** Isometric projection: X to the lower-right, Z to the lower-left, LDraw +Y (down) straight down. */
function project([x, y, z]: V3): [number, number] {
  const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
  return [(x - z) * c, (x + z) * s + y];
}
function depth([x, y, z]: V3): number {
  return x + z - y;
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

interface Face {
  pts: [number, number][];
  fill: string;
  depth: number;
}

// Box faces as index quads into the 8 corners, with their outward normal in local space.
const FACES: { idx: [number, number, number, number]; n: V3 }[] = [
  { idx: [0, 1, 2, 3], n: [0, -1, 0] }, // top (y = 0, LDraw up is -Y)
  { idx: [4, 5, 6, 7], n: [0, 1, 0] }, // bottom
  { idx: [1, 2, 6, 5], n: [1, 0, 0] }, // +x
  { idx: [0, 3, 7, 4], n: [-1, 0, 0] }, // -x
  { idx: [2, 3, 7, 6], n: [0, 0, 1] }, // +z
  { idx: [0, 1, 5, 4], n: [0, 0, -1] }, // -z
];

function brickFaces(p: LegoPlacement): Face[] {
  const [sx, sz, h] = dimsOf(p.ldrawPart);
  const hx = sx * 10, hz = sz * 10;
  const local: V3[] = [
    [-hx, 0, -hz], [hx, 0, -hz], [hx, 0, hz], [-hx, 0, hz],
    [-hx, h, -hz], [hx, h, -hz], [hx, h, hz], [-hx, h, hz],
  ];
  const world = local.map((v) => apply(p, v));
  const base = COLORS[p.ldrawColor] ?? "#888888";
  const faces: Face[] = [];
  for (const f of FACES) {
    const n = norm(rotate(p, f.n));
    if (dot(n, VIEW) <= 0) continue;
    const k = 0.62 + 0.45 * Math.max(0, dot(n, LIGHT));
    const corners = f.idx.map((i) => world[i]);
    faces.push({ pts: corners.map(project), fill: shade(base, k), depth: Math.max(...corners.map(depth)) });
    if (f.n[1] === -1) {
      // studs on the top face, as small ellipses
      for (const [sx0, sz0] of studPositions(p.ldrawPart)) {
        const c = apply(p, [sx0, -2, sz0]);
        const ring: [number, number][] = [];
        for (let a = 0; a < 12; a++) {
          const t = (a / 12) * Math.PI * 2;
          ring.push(project([c[0] + 6 * Math.cos(t), c[1], c[2] + 6 * Math.sin(t)]));
        }
        faces.push({ pts: ring, fill: shade(base, k * 1.1), depth: depth(c) + 0.01 });
      }
    }
  }
  return faces;
}

/** Stable per-brick draw order: far to near along the view axis, low to high. */
function brickDepth(p: LegoPlacement): number {
  const [sx, sz, h] = dimsOf(p.ldrawPart);
  return depth(apply(p, [0, h / 2, 0])) - (sx + sz) * 0.001;
}

export function thumbnailSvg(manual: Manual<LegoPlacement>): string {
  const bricks = [...manual.parts].sort((a, b) => brickDepth(a.placement) - brickDepth(b.placement));
  const faces = bricks.flatMap((b) => brickFaces(b.placement));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of faces)
    for (const [x, y] of f.pts) {
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  if (!faces.length) {
    minX = -50; minY = -50; maxX = 50; maxY = 50;
  }
  const w = maxX - minX || 1, h = maxY - minY || 1;
  const scale = (SIZE - 2 * PAD) / Math.max(w, h);
  const ox = PAD + ((SIZE - 2 * PAD) - w * scale) / 2 - minX * scale;
  const oy = PAD + ((SIZE - 2 * PAD) - h * scale) / 2 - minY * scale;
  const fmt = (n: number) => n.toFixed(1);
  const polys = faces
    .map((f) => `<polygon points="${f.pts.map(([x, y]) => `${fmt(x * scale + ox)},${fmt(y * scale + oy)}`).join(" ")}" fill="${f.fill}" stroke="#0f1318" stroke-width="0.6" stroke-linejoin="round"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="#0f1318"/>${polys}</svg>`;
}
