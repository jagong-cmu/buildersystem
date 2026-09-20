"use client";
// Breadboard renderer (PRD §13.2): hand-drawn SVG. Rows a–e / f–j × 30 columns, two power rails, a pin strip for the board.
import { useEffect, useMemo, useRef } from "react";
import type { RendererProps } from "@/core/plugin";
import type { BoardPlacement, PartInstance } from "@/core/types";
import { BOARD_PINS, BOARD_PITCH, BOARD_X0, BOARD_Y, COL0, COLS, H, PITCH, ROW_Y, W, WIRE_COLORS, endXY, holeXY, wirePath } from "./layout";

type Phase = "hidden" | "ghost" | "current";

const BAND: Record<string, string> = { "0": "#000", "1": "#8b4513", "2": "#e11", "3": "#f80", "4": "#fd0", "5": "#0a0", "6": "#00f", "7": "#808", "8": "#888", "9": "#fff" };
function bands(ohms: number): string[] {
  const s = Math.round(ohms).toString();
  const mult = s.length - 2;
  return [BAND[s[0]], BAND[s[1] ?? "0"], BAND[String(Math.max(0, mult))]];
}

function Part({ inst, phase }: { inst: PartInstance<BoardPlacement>; phase: Phase }) {
  if (phase === "hidden") return null;
  const op = phase === "ghost" ? 0.35 : 1;
  const glow = phase === "current" ? "url(#glow)" : undefined;
  const pl = inst.placement;
  if (pl.kind === "wire") {
    const [x1, y1] = endXY(pl.from);
    const [x2, y2] = endXY(pl.to);
    const d = wirePath(pl.from, pl.to);
    return (
      <g opacity={op} filter={glow}>
        <path d={d} fill="none" stroke={WIRE_COLORS[inst.color ?? ""] ?? "#9ad"} strokeWidth={4} strokeLinecap="round" pathLength={1} className={phase === "current" ? "wire-draw" : undefined} />
        <circle cx={x1} cy={y1} r={4} fill="#ccc" />
        <circle cx={x2} cy={y2} r={4} fill="#ccc" />
      </g>
    );
  }
  const pts = pl.pins.map(holeXY);
  if (!pts.length) return null;
  const [x1, y1] = pts[0];
  const [x2, y2] = pts[1] ?? pts[0];
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  const ohms = Number(inst.partType.match(/resistor_(\d+)(k?)/)?.[1] ?? 0) * (inst.partType.endsWith("k") ? 1000 : 1);
  return (
    <g opacity={op} filter={glow}>
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={4.5} fill="#bbb" />
      ))}
      {inst.partType.startsWith("bb:resistor") && (
        <g>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#999" strokeWidth={3} />
          <g transform={`translate(${cx} ${cy}) rotate(${(Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI})`}>
            <rect x={-22} y={-7} width={44} height={14} rx={5} fill="#d9c8a0" stroke="#7a6a45" />
            {bands(ohms).map((c, i) => (
              <rect key={i} x={-14 + i * 9} y={-7} width={4} height={14} fill={c} />
            ))}
          </g>
        </g>
      )}
      {inst.partType.startsWith("bb:led") && (
        <g>
          <line x1={x1} y1={y1} x2={x1} y2={y1 - 18} stroke="#999" strokeWidth={3} />
          <line x1={x2} y1={y2} x2={x2} y2={y2 - 14} stroke="#999" strokeWidth={3} />
          <circle cx={cx} cy={y1 - 30} r={13} fill={WIRE_COLORS[inst.partType.replace("bb:led_", "")] ?? "#e33"} stroke="#fff5" />
          <text x={x1 - 6} y={y1 - 20} fontSize={9} fill="#ccc">+</text>
        </g>
      )}
      {inst.partType === "bb:photoresistor" && (
        <g>
          <line x1={x1} y1={y1} x2={cx - 10} y2={cy - 22} stroke="#999" strokeWidth={3} />
          <line x1={x2} y1={y2} x2={cx + 10} y2={cy - 22} stroke="#999" strokeWidth={3} />
          <circle cx={cx} cy={cy - 30} r={15} fill="#e8d9b5" stroke="#8a6d3b" />
          <path d={`M ${cx - 9} ${cy - 36} q 4 6 8 0 t 8 0 M ${cx - 9} ${cy - 28} q 4 6 8 0 t 8 0`} fill="none" stroke="#b5451b" strokeWidth={2} />
        </g>
      )}
      {inst.partType === "bb:pushbutton" && (
        <g>
          <rect x={Math.min(...pts.map((p) => p[0])) - 8} y={Math.min(...pts.map((p) => p[1])) - 8} width={Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])) + 16} height={Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1])) + 16} rx={4} fill="#2b2b2b" stroke="#666" />
          <circle cx={pts.reduce((s, p) => s + p[0], 0) / pts.length} cy={pts.reduce((s, p) => s + p[1], 0) / pts.length} r={9} fill="#111" stroke="#888" />
        </g>
      )}
      {(inst.partType === "bb:potentiometer" || inst.partType === "bb:buzzer") && <circle cx={cx} cy={cy - 24} r={14} fill="#333" stroke="#888" />}
    </g>
  );
}

export function BreadboardRenderer({ manual, step, registerSnapshot }: RendererProps<BoardPlacement>) {
  const svgRef = useRef<SVGSVGElement>(null);
  const stepOf = useMemo(() => {
    const m = new Map<string, number>();
    manual.steps.forEach((s) => s.add.forEach((id) => m.set(id, s.n)));
    return m;
  }, [manual]);
  useEffect(() => {
    registerSnapshot?.(async () => {
      const svg = svgRef.current;
      if (!svg) return null;
      const xml = new XMLSerializer().serializeToString(svg);
      return new Blob([xml], { type: "image/svg+xml" });
    });
  }, [registerSnapshot]);

  const current = manual.steps.find((s) => s.n === step);
  const targetHoles: [number, number][] = [];
  for (const id of current?.add ?? []) {
    const p = manual.parts.find((x) => x.id === id);
    if (!p) continue;
    if (p.placement.kind === "part") p.placement.pins.forEach((h) => targetHoles.push(holeXY(h)));
    else targetHoles.push(endXY(p.placement.from), endXY(p.placement.to));
  }

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ background: "#0f1318" }}>
      <defs>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#ffb020" floodOpacity="0.9" />
        </filter>
        <style>{`
          .wire-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw .6s ease-out forwards; }
          @keyframes draw { to { stroke-dashoffset: 0; } }
          .pulse { animation: pulse 1.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
          @keyframes pulse { 0%,100% { transform: scale(1); opacity: .9 } 50% { transform: scale(1.8); opacity: .3 } }
        `}</style>
      </defs>
      {/* breadboard body */}
      <rect x={COL0 - 40} y={20} width={COLS * PITCH + 60} height={360} rx={10} fill="#f1f1ec" />
      <line x1={COL0 - 40} y1={235} x2={COL0 + COLS * PITCH + 20} y2={235} stroke="#d8d8d0" strokeWidth={8} />
      {[["vcc", "#e5383b", "+"], ["gnd", "#3b6cf6", "−"]].map(([row, c, label]) => (
        <g key={row}>
          <line x1={COL0 - 30} y1={ROW_Y[row] - 11} x2={COL0 + COLS * PITCH} y2={ROW_Y[row] - 11} stroke={c} strokeWidth={1.5} />
          <text x={COL0 - 36} y={ROW_Y[row] + 4} fontSize={12} fill={c}>{label}</text>
        </g>
      ))}
      {Object.entries(ROW_Y).map(([row, y]) =>
        Array.from({ length: COLS }, (_, i) => (
          <circle key={`${row}${i}`} cx={COL0 + i * PITCH} cy={y} r={3.2} fill="#8f8f88" />
        )),
      )}
      {Object.entries(ROW_Y)
        .filter(([r]) => r.length === 1)
        .map(([row, y]) => (
          <text key={row} x={COL0 - 22} y={y + 4} fontSize={11} fill="#666" className="mono">{row}</text>
        ))}
      {Array.from({ length: COLS }, (_, i) => (
        <text key={i} x={COL0 + i * PITCH - 3} y={104} fontSize={9} fill="#777">{i + 1}</text>
      ))}
      {/* board pin strip */}
      <rect x={BOARD_X0 - 30} y={BOARD_Y - 44} width={BOARD_PINS.length * BOARD_PITCH + 30} height={74} rx={8} fill="#1d5c8a" />
      <text x={BOARD_X0 - 24} y={BOARD_Y - 34} fontSize={11} fill="#cfe6ff">UNO Q</text>
      {BOARD_PINS.map((p, i) => (
        <g key={p}>
          <rect x={BOARD_X0 + i * BOARD_PITCH - 5} y={BOARD_Y - 5} width={10} height={10} fill="#111" />
          <text x={BOARD_X0 + i * BOARD_PITCH - 9} y={BOARD_Y + 22} fontSize={9} fill="#cfe6ff">{p}</text>
        </g>
      ))}
      {/* parts: wires first so components sit on top */}
      {[...manual.parts]
        .sort((a) => (a.placement.kind === "wire" ? -1 : 1))
        .map((p) => {
          const n = stepOf.get(p.id) ?? 0;
          const phase: Phase = n > step ? "hidden" : n === step ? "current" : "ghost";
          return <Part key={`${p.id}-${phase === "current" ? step : "g"}`} inst={p} phase={phase} />;
        })}
      {targetHoles.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={6} fill="none" stroke="#ffb020" strokeWidth={2} className="pulse" />
      ))}
    </svg>
  );
}
