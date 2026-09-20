"use client";
// Fabric renderer (PRD §13.3): cut layout (pieces nested on the scanned scraps) and an assembly diagram
// with the active seam drawing itself. Pure SVG.
import { useEffect, useMemo, useRef } from "react";
import type { RendererProps } from "@/core/plugin";
import type { FabricPlacement, PartInstance } from "@/core/types";
import { readInventory } from "@/lib/inventory-store";
import { fabricFeasibility } from ".";
import { bbox, type Placement } from "./nesting";

const W = 920, H = 520;
const CLASS_COLOR: Record<string, string> = { "fab:cotton_woven": "#d98cb3", "fab:canvas": "#c9b58a", "fab:denim": "#4a6fa5", "fab:fleece": "#9ad0c2", "fab:knit": "#e8c170" };

type PieceInst = PartInstance<FabricPlacement> & { placement: Extract<FabricPlacement, { kind: "piece" }> };

export function FabricRenderer({ manual, step, registerSnapshot }: RendererProps<FabricPlacement>) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    registerSnapshot?.(async () => {
      const svg = svgRef.current;
      return svg ? new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }) : null;
    });
  }, [registerSnapshot]);

  const pieces = manual.parts.filter((p): p is PieceInst => p.placement.kind === "piece");
  const current = manual.steps.find((s) => s.n === step);
  const meta = (current?.meta ?? {}) as { kind?: string; pieces?: string[]; seam?: { a: [string, string]; b: [string, string] }; notion?: string };
  const cutMode = step === 0 || meta.kind === "cut";

  // Cut layout: use the real scraps from the inventory when they were measured; otherwise lay pieces in a row.
  const layout = useMemo(() => {
    const inv = readInventory("fabric");
    const scraps = inv.items.filter((it) => it.polygonMm && it.polygonMm.length >= 3).map((it, i) => ({ id: `scrap${i + 1}`, cls: it.partType, ...bbox(it.polygonMm!) }));
    const feas = scraps.length ? fabricFeasibility(inv, manual) : null;
    const placements = (feas?.assignment as Placement[] | undefined) ?? [];
    return { scraps, placements, ok: feas?.ok ?? false };
  }, [manual]);

  const seamPieces = meta.seam ? new Set([meta.seam.a[0], meta.seam.b[0]]) : new Set<string>();
  const activeIds = new Set([...(meta.pieces ?? []), ...(meta.kind === "cut" ? current?.add ?? [] : []), ...seamPieces]);
  const zipperOn = meta.notion === "fab:zipper" ? new Set(meta.pieces ?? []) : new Set<string>();

  // Scale: fit the content into the viewbox.
  let content: { w: number; h: number };
  if (cutMode && layout.scraps.length) {
    content = { w: layout.scraps.reduce((s, sc) => s + sc.w + 40, 0), h: Math.max(...layout.scraps.map((s) => s.h)) };
  } else {
    content = { w: pieces.reduce((s, p) => s + bbox(p.placement.polygonMm).w + 60, 0), h: Math.max(...pieces.map((p) => bbox(p.placement.polygonMm).h), 100) };
  }
  const scale = Math.min((W - 80) / content.w, (H - 120) / content.h, 3);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ background: "#0f1318" }}>
      <defs>
        <style>{`
          .seam { stroke-dasharray: 8 6; animation: dash 1s linear infinite; }
          @keyframes dash { to { stroke-dashoffset: -28; } }
          .grow { stroke-dasharray: 1; stroke-dashoffset: 1; animation: grow .7s ease-out forwards; }
          @keyframes grow { to { stroke-dashoffset: 0; } }
        `}</style>
        <pattern id="fabric" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 0L8 8M8 0L0 8" stroke="#0003" strokeWidth="1" />
        </pattern>
      </defs>
      <text x={24} y={32} fontSize={14} fill="#8b97a5">
        {cutMode ? (layout.scraps.length ? `Cut layout on your ${layout.scraps.length} scrap${layout.scraps.length > 1 ? "s" : ""}` : "Pattern pieces (scan scraps to see them nested)") : current?.title ?? "Assembly"}
      </text>
      <g transform={`translate(40 60) scale(${scale})`}>
        {cutMode && layout.scraps.length > 0
          ? layout.scraps.map((sc, i) => {
              const x0 = layout.scraps.slice(0, i).reduce((s, x) => s + x.w + 40, 0);
              return (
                <g key={sc.id} transform={`translate(${x0} 0)`}>
                  <rect width={sc.w} height={sc.h} fill={CLASS_COLOR[sc.cls] ?? "#777"} opacity={0.55} rx={4} />
                  <rect width={sc.w} height={sc.h} fill="url(#fabric)" rx={4} />
                  <text x={4} y={-6 / scale} fontSize={12 / scale} fill="#8b97a5">{sc.id} · {Math.round(sc.w)}×{Math.round(sc.h)} mm</text>
                  {layout.placements
                    .filter((p) => p.scrapId === sc.id)
                    .map((p) => (
                      <g key={p.pieceId}>
                        <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="#fff" fillOpacity={activeIds.has(p.pieceId) || step === 0 ? 0.9 : 0.4} stroke="#ffb020" strokeWidth={activeIds.has(p.pieceId) ? 3 / scale : 1 / scale} className={activeIds.has(p.pieceId) ? "grow" : undefined} pathLength={1} />
                        <text x={p.x + 6} y={p.y + 18 / scale} fontSize={13 / scale} fill="#222">{p.pieceId}{p.rotated ? " ↻" : ""}</text>
                      </g>
                    ))}
                </g>
              );
            })
          : pieces.map((p, i) => {
              const b = bbox(p.placement.polygonMm);
              const x0 = pieces.slice(0, i).reduce((s, q) => s + bbox(q.placement.polygonMm).w + 60, 0);
              const n = manual.steps.find((s) => s.add.includes(p.id))?.n ?? 1;
              const hidden = !cutMode && n > step;
              const active = activeIds.has(p.id) || seamPieces.has(p.id);
              const seamEdge = meta.seam && (meta.seam.a[0] === p.id ? meta.seam.a[1] : meta.seam.b[0] === p.id ? meta.seam.b[1] : null);
              if (hidden) return null;
              return (
                <g key={p.id} transform={`translate(${x0} 0)`} opacity={active || cutMode ? 1 : 0.6} style={{ transition: "opacity .4s ease" }}>
                  <polygon points={p.placement.polygonMm.map(([x, y]) => `${x},${y}`).join(" ")} fill={CLASS_COLOR[p.placement.fabricClass] ?? "#777"} stroke={active ? "#ffb020" : "#fff8"} strokeWidth={(active ? 3 : 1) / scale} />
                  <polygon points={p.placement.polygonMm.map(([x, y]) => `${x},${y}`).join(" ")} fill="url(#fabric)" />
                  {seamEdge && <SeamEdge b={b} edge={seamEdge} scale={scale} />}
                  {zipperOn.has(p.id) && <Zipper w={b.w} scale={scale} />}
                  <text x={8} y={22 / scale} fontSize={14 / scale} fill="#fff" stroke="#0008" strokeWidth={3 / scale} paintOrder="stroke">{p.id} · {Math.round(b.w)}×{Math.round(b.h)} mm</text>
                </g>
              );
            })}
      </g>
      {!cutMode && meta.seam && (
        <text x={24} y={H - 24} fontSize={13} fill="#ffb020">
          Seam: {meta.seam.a.join(" · ")} ↔ {meta.seam.b.join(" · ")}
        </text>
      )}
    </svg>
  );
}

/** A zipper laid along the top edge: tape + teeth + pull. */
function Zipper({ w, scale }: { w: number; scale: number }) {
  const teeth = Math.floor(w / 6);
  return (
    <g className="grow" pathLength={1}>
      <rect x={0} y={-14} width={w} height={14} fill="#333" stroke="#ffb020" strokeWidth={2 / scale} />
      {Array.from({ length: teeth }, (_, i) => (
        <rect key={i} x={i * 6 + 1} y={-9} width={3} height={4} fill="#ddd" />
      ))}
      <rect x={w - 18} y={-20} width={10} height={16} rx={2} fill="#bbb" />
    </g>
  );
}

function SeamEdge({ b, edge, scale }: { b: { w: number; h: number }; edge: string; scale: number }) {
  const segs: [number, number, number, number][] = [];
  const e = edge.toLowerCase();
  if (e.includes("top") || e === "all" || e === "edge") segs.push([0, 0, b.w, 0]);
  if (e.includes("bottom") || e === "all" || e === "edge") segs.push([0, b.h, b.w, b.h]);
  if (e.includes("side") || e === "all" || e === "edge") segs.push([0, 0, 0, b.h], [b.w, 0, b.w, b.h]);
  if (e.includes("casing")) segs.push([0, 30, b.w, 30]);
  return (
    <g>
      {segs.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ffb020" strokeWidth={4 / scale} className="seam" />
      ))}
    </g>
  );
}
