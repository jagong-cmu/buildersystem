"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Inventory, InventoryItem } from "@/core/types";
import { FABRIC_PARTS } from "@/domains/fabric/vocabulary";
import { MAT, applyHomography, matHomography, polygonStats, type Homography, type Pt } from "@/lib/marker-mat";
import { createDetector, type DetectedMarker } from "@/lib/aruco";

const FABRIC_CLASSES = FABRIC_PARTS.filter((p) => p.props?.kind === "fabric");
const DETECT_MAX_W = 1280;

interface Frame {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  markers: DetectedMarker[];
  homography: Homography | null;
}

/**
 * Fabric scrap measurement (PRD §9): find the four A3 marker-mat ArUco markers in a captured frame,
 * solve the pixel→mm homography, then let the user outline each scrap by clicking its corners.
 * Falls back to a manual W×H entry when the mat is not detected.
 */
export function ScrapMeasure({ frame, inventory, onChange }: { frame: Blob | null; inventory: Inventory; onChange: (inv: Inventory) => void }) {
  const [state, setState] = useState<Frame | null>(null);
  const [pending, setPending] = useState<Blob | null>(null);
  const [points, setPoints] = useState<Pt[]>([]);
  const busy = pending !== null && pending !== state?.blob;
  const [cls, setCls] = useState(FABRIC_CLASSES[0].id);
  const [manual, setManual] = useState({ w: "", h: "" });
  const [last, setLast] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!frame) return;
    const t = setTimeout(() => start(frame), 0);
    return () => clearTimeout(t);
  }, [frame]);

  function start(blob: Blob) {
    setPending(blob);
    analyze(blob).then((f) => {
      setState((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return f;
      });
      setPoints([]);
    });
  }

  const scraps = useMemo(() => inventory.items.filter((i) => i.polygonMm && i.polygonMm.length >= 3), [inventory]);

  function addItem(polygonMm: Pt[]) {
    const item: InventoryItem = { partType: cls, qty: 1, polygonMm, conf: 1 };
    onChange({ ...inventory, items: [...inventory.items, item] });
    const s = polygonStats(polygonMm);
    setLast(`${fmt(s.wMm)} × ${fmt(s.hMm)} mm (${fmt(s.areaMm2 / 100)} cm²)`);
  }

  function onImageClick(e: React.MouseEvent<HTMLImageElement>) {
    const img = imgRef.current;
    if (!img || !state?.homography) return;
    const r = img.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * state.width;
    const y = ((e.clientY - r.top) / r.height) * state.height;
    setPoints((p) => [...p, [x, y]]);
  }

  function commitPolygon() {
    if (!state?.homography || points.length < 4) return;
    const H = state.homography;
    addItem(points.map((p) => applyHomography(H, p).map((v) => Math.round(v * 10) / 10) as Pt));
    setPoints([]);
  }

  function commitManual() {
    const w = Number(manual.w), h = Number(manual.h);
    if (!(w > 0 && h > 0)) return;
    addItem([[0, 0], [w, 0], [w, h], [0, h]]);
    setManual({ w: "", h: "" });
  }

  const mmPoly = state?.homography && points.length >= 2 ? points.map((p) => applyHomography(state.homography!, p)) : null;
  const live = mmPoly && mmPoly.length >= 3 ? polygonStats(mmPoly) : null;

  return (
    <div className="panel p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold">Measure scraps</h3>
        <div className="flex items-center gap-2 text-sm">
          {busy && <span className="muted">Looking for markers…</span>}
          {!busy && state && (
            <span className={`chip ${state.homography ? "ok" : "warn"}`} data-testid="mat-status">
              {state.homography ? `Mat found · ${state.markers.length} markers` : state.markers.length ? `Only ${state.markers.length}/4 markers found` : "No mat markers found"}
            </span>
          )}
          <a className="btn sm" href="/marker-mat.svg" target="_blank" rel="noreferrer">
            Print mat (A3)
          </a>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm flex-wrap">
        <label className="muted">Fabric class</label>
        <select className="btn sm" value={cls} onChange={(e) => setCls(e.target.value)} data-testid="scrap-class">
          {FABRIC_CLASSES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label className="btn sm">
          Load mat photo
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) start(f);
            }}
          />
        </label>
      </div>

      {state && (
        <div className="relative select-none" style={{ cursor: state.homography ? "crosshair" : "default" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} src={state.url} alt="captured frame" className="w-full rounded-md block" onClick={onImageClick} data-testid="scrap-frame" />
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${state.width} ${state.height}`} preserveAspectRatio="none">
            {state.markers.map((m) => (
              <g key={m.id}>
                <polygon points={m.corners.map((c) => c.join(",")).join(" ")} fill="none" stroke="#3ddc84" strokeWidth={state.width / 300} />
                <text x={m.corners[0][0]} y={m.corners[0][1] - state.width / 120} fill="#3ddc84" fontSize={state.width / 40} fontFamily="monospace">
                  {m.id}
                </text>
              </g>
            ))}
            {points.length > 0 && (
              <polygon points={points.map((c) => c.join(",")).join(" ")} fill="rgba(255,196,0,0.2)" stroke="#ffc400" strokeWidth={state.width / 300} />
            )}
            {points.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r={state.width / 150} fill="#ffc400" />
            ))}
          </svg>
        </div>
      )}

      {state?.homography ? (
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="muted">
            Click 4+ corners of a scrap · {points.length} point{points.length === 1 ? "" : "s"}
            {live && (
              <>
                {" "}
                · <span className="mono">{fmt(live.wMm)} × {fmt(live.hMm)} mm</span>
              </>
            )}
          </span>
          <button className="btn sm" onClick={() => setPoints((p) => p.slice(0, -1))} disabled={!points.length}>
            Undo
          </button>
          <button className="btn sm" onClick={() => setPoints([])} disabled={!points.length}>
            Clear
          </button>
          <button className="btn sm primary" onClick={commitPolygon} disabled={points.length < 4} data-testid="add-scrap">
            Add scrap
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="muted">{state ? "No scale reference — enter the scrap size:" : "Capture or load a photo of scraps on the marker mat, or enter a size:"}</span>
          <input className="btn sm w-20 mono" type="number" min={1} placeholder="W mm" value={manual.w} onChange={(e) => setManual({ ...manual, w: e.target.value })} data-testid="manual-w" />
          ×
          <input className="btn sm w-20 mono" type="number" min={1} placeholder="H mm" value={manual.h} onChange={(e) => setManual({ ...manual, h: e.target.value })} data-testid="manual-h" />
          <button className="btn sm primary" onClick={commitManual} disabled={!(Number(manual.w) > 0 && Number(manual.h) > 0)} data-testid="add-manual">
            Add scrap
          </button>
        </div>
      )}

      {last && (
        <div className="text-sm" data-testid="last-scrap">
          Added <span className="mono">{last}</span>
        </div>
      )}

      {scraps.length > 0 && (
        <ul className="text-sm divide-y" style={{ borderColor: "var(--line)" }}>
          {scraps.map((s, i) => {
            const st = polygonStats(s.polygonMm!);
            return (
              <li key={i} className="flex items-center justify-between py-1">
                <span>{FABRIC_PARTS.find((p) => p.id === s.partType)?.name ?? s.partType}</span>
                <span className="mono muted">
                  {fmt(st.wMm)} × {fmt(st.hMm)} mm · {s.polygonMm!.length} pts
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function fmt(v: number): string {
  return (Math.round(v * 10) / 10).toString();
}

async function analyze(blob: Blob): Promise<Frame> {
  const url = URL.createObjectURL(blob);
  const img = await loadImage(url);
  const scale = Math.min(1, DETECT_MAX_W / img.naturalWidth);
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const markers = createDetector()
    .detect(data)
    .filter((m) => (MAT.ids as readonly number[]).includes(m.id))
    .map((m) => ({ ...m, corners: m.corners.map(([x, y]) => [x / scale, y / scale] as Pt) }));
  return { blob, url, width: img.naturalWidth, height: img.naturalHeight, markers, homography: matHomography(markers) };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = url;
  });
}
