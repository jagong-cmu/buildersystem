import { describe, expect, it } from "vitest";
import { MAT, applyHomography, findHomography, markerCornersMm, matHomography, polygonStats, markerMatSvg, type Pt } from "../marker-mat";
import { createDetector, markerSvg } from "../aruco";

function close(a: Pt, b: Pt, eps = 0.05) {
  expect(Math.abs(a[0] - b[0])).toBeLessThan(eps);
  expect(Math.abs(a[1] - b[1])).toBeLessThan(eps);
}

describe("homography → mm", () => {
  it("recovers a synthetic square under a perspective camera", () => {
    // Synthetic camera: perspective warp of the mat plane into pixels.
    const cam: [number, number, number, number, number, number, number, number, number] = [3.1, 0.4, 120, -0.2, 2.7, 80, 0.0006, 0.0003, 1];
    const toPx = (p: Pt) => applyHomography(cam, p);
    const markers = MAT.ids.map((id) => ({ id, corners: markerCornersMm(id).map(toPx) }));
    const H = matHomography(markers);
    expect(H).not.toBeNull();
    // A 100 mm square scrap at (150, 100) mm on the mat.
    const square: Pt[] = [[150, 100], [250, 100], [250, 200], [150, 200]];
    const measured = square.map((p) => applyHomography(H!, toPx(p)));
    measured.forEach((m, i) => close(m, square[i]));
    const s = polygonStats(measured);
    expect(s.wMm).toBeCloseTo(100, 1);
    expect(s.hMm).toBeCloseTo(100, 1);
    expect(s.areaMm2).toBeCloseTo(10000, 0);
  });

  it("findHomography maps the source points exactly", () => {
    const src: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10], [5, 5]];
    const dst: Pt[] = [[1, 1], [21, 2], [22, 23], [2, 21], [11.5, 11.7]];
    const H = findHomography(src, dst);
    src.forEach((p, i) => close(applyHomography(H, p), dst[i], 0.5));
  });

  it("needs all four markers", () => {
    expect(matHomography([{ id: 0, corners: markerCornersMm(0) }])).toBeNull();
  });
});

describe("marker mat", () => {
  it("renders a valid A3 SVG whose markers js-aruco2 detects at the right mm positions", () => {
    const svg = markerMatSvg(markerSvg);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('width="420mm"');
    expect(svg).toContain('height="297mm"');
    expect(svg.match(/fill="black"/g)?.length).toBe(4);
    expect(svg.match(/fill="white"/g)?.length).toBeGreaterThan(4);

    // Rasterize the four markers at 2 px/mm and check the detector finds ids 0–3 at their corners.
    const S = 2, W = MAT.widthMm * S, Hh = MAT.heightMm * S;
    const data = new Uint8ClampedArray(W * Hh * 4).fill(255);
    for (const id of MAT.ids) {
      const { svg: ms, size } = markerSvg(id);
      const [[x0, y0]] = markerCornersMm(id);
      const unit = (MAT.markerMm / size) * S;
      for (const r of ms.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(\w+)"/g)) {
        const v = r[5] === "black" ? 0 : 255;
        for (let y = 0; y < +r[4] * unit; y++)
          for (let x = 0; x < +r[3] * unit; x++) {
            const px = Math.round((x0 - MAT.markerMm / size) * S + +r[1] * unit + x);
            const py = Math.round((y0 - MAT.markerMm / size) * S + +r[2] * unit + y);
            const i = (py * W + px) * 4;
            data[i] = data[i + 1] = data[i + 2] = v;
          }
      }
    }
    const found = createDetector().detect({ width: W, height: Hh, data }).filter((m) => m.hammingDistance === 0);
    expect(found.map((m) => m.id).sort()).toEqual([0, 1, 2, 3]);
    const H = matHomography(found);
    expect(H).not.toBeNull();
    close(applyHomography(H!, [W / 2, Hh / 2]), [MAT.widthMm / 2, MAT.heightMm / 2], 1);
  });
});
