// Procedural three.js geometry for each LEGO shape kind (see dims.ts for the local frame:
// origin on the top plane, +Y down, slopes descend towards +Z, extrusions run along X).
import * as THREE from "three";
import { dimsOf, shapeOf, type ShapeKind } from "./dims";

const GAP = 0.6; // visual seam between neighbouring bricks
const cache = new Map<string, THREE.BufferGeometry>();

export function partGeometry(part: string): THREE.BufferGeometry {
  const hit = cache.get(part);
  if (hit) return hit;
  const geo = build(part);
  cache.set(part, geo);
  return geo;
}

function build(part: string): THREE.BufferGeometry {
  const [sx, sz, h] = dimsOf(part);
  const kind = shapeOf(part).kind;
  const w = sx * 20 - GAP, d = sz * 20 - GAP, hh = h - 0.4;
  switch (kind) {
    case "box":
      return new THREE.BoxGeometry(w, hh, d).translate(0, h / 2, 0);
    case "cylinder":
      return new THREE.CylinderGeometry(w / 2, w / 2, hh, 32).translate(0, h / 2, 0);
    case "quarter": {
      const r = sx * 20 - GAP / 2;
      return new THREE.CylinderGeometry(r, r, hh, 32, 1, false, 0, Math.PI / 2).translate(-sx * 10 + GAP / 2, h / 2, -sz * 10 + GAP / 2);
    }
    case "halfTile": {
      const r = w / 2;
      const flat = d - r;
      const box = new THREE.BoxGeometry(w, hh, flat).translate(0, h / 2, -sz * 10 + flat / 2);
      const cyl = new THREE.CylinderGeometry(r, r, hh, 24, 1, false, 0, Math.PI).translate(0, h / 2, sz * 10 - r);
      return merge([box, cyl]);
    }
    case "dome": {
      const r = w / 2;
      const sphere = new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, h / r, 1);
      sphere.rotateX(Math.PI).translate(0, h, 0);
      return sphere;
    }
    case "cone":
      return new THREE.CylinderGeometry(3, w / 2, hh, 24).translate(0, h / 2, 0);
    case "rod":
      return new THREE.CylinderGeometry(4, 4, hh, 16).translate(0, h / 2, 0);
    case "flame": {
      const g = new THREE.SphereGeometry(6, 16, 12).scale(1, h / 12, 0.6);
      return g.translate(0, h / 2, 0);
    }
    case "plant": {
      const base = new THREE.CylinderGeometry(w / 2, w / 2, hh, 24).translate(0, h / 2, 0);
      const leaves: THREE.BufferGeometry[] = [base];
      for (const a of [-0.6, 0, 0.6]) {
        const leaf = new THREE.BoxGeometry(9, 1.5, 22).translate(0, h / 2, 10 + 11);
        leaf.rotateY(a);
        leaves.push(leaf);
      }
      return merge(leaves);
    }
    default:
      return extruded(kind, sx, sz, h);
  }
}

/** Profiles in the (z, y) plane, extruded along X. */
function profile(kind: ShapeKind, sz: number, h: number): [number, number][] {
  const z0 = -sz * 10 + GAP / 2, z1 = sz * 10 - GAP / 2, y1 = h - 0.4;
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 12): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return out;
  };
  switch (kind) {
    case "slope": // 45°: high wall at -Z, one stud of flat top, then slope down to +Z
      return [[z0, 0], [z0 + 20, 0], [z1, y1], [z0, y1]];
    case "slopeLow": // cheese slope: small lip at +Z
      return [[z0, 0], [z0 + 2, 0], [z1, y1 - 4], [z1, y1], [z0, y1]];
    case "slopeInv": // full top, underside cut from the +Z bottom edge up to one stud from -Z
      return [[z0, 0], [z1, 0], [z1, 4], [z0 + 20, y1], [z0, y1]];
    case "curved": // quarter-round from the top at -Z down to a lip at +Z
      return [[z0, 0], ...arc(z0, y1 - 4, z1 - z0, -Math.PI / 2, 0).slice(1), [z1, y1], [z0, y1]];
    case "curvedInv": // inverted half arch: full top, arch scooped out under the +Z half
      return [[z0, 0], [z1, 0], [z1, 4], ...arc(z1, y1, z1, Math.PI, Math.PI * 1.5).reverse().slice(1), [z0, y1]];
    case "halfCyl": {
      const r = (z1 - z0) / 2;
      return [...arc(0, y1 - r, r, Math.PI, Math.PI * 2), [z1, y1], [z0, y1]];
    }
    default:
      return [[z0, 0], [z1, 0], [z1, y1], [z0, y1]];
  }
}

function extruded(kind: ShapeKind, sx: number, sz: number, h: number): THREE.BufferGeometry {
  const depth = sx * 20 - GAP;
  const shape = new THREE.Shape();
  // Shape space (u, v) -> after a +90° turn about Y: u = -z, v = y, extrusion runs along +X.
  profile(kind, sz, h).forEach(([z, y], i) => (i === 0 ? shape.moveTo(-z, y) : shape.lineTo(-z, y)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.rotateY(Math.PI / 2);
  geo.translate(-depth / 2, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [], normals: number[] = [];
  for (const g of parts) {
    const ng = g.index ? g.toNonIndexed() : g;
    positions.push(...Array.from(ng.getAttribute("position").array));
    normals.push(...Array.from(ng.getAttribute("normal").array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return out;
}
