"use client";
import { useMemo } from "react";
import type { DomainId, Inventory, PartType } from "@/core/types";
import { PLUGINS } from "@/domains";
import { withQty } from "@/lib/inventory-store";
import { LDRAW_COLORS } from "@/domains/lego/vocabulary";

const LEGO_COLORS = ["red", "blue", "yellow", "white", "black", "green", "bright green", "lime", "coral", "bright pink", "reddish brown", "medium azure", "tan", "trans clear", "trans orange", "light gray"];

/**
 * Editable inventory (PRD §5.2): the demo must never be blocked by a misdetection.
 * Rows are the domain vocabulary; LEGO rows are per color.
 */
export function InventoryEditor({ domain, inventory, onChange, extraParts = [] }: { domain: DomainId; inventory: Inventory; onChange: (i: Inventory) => void; extraParts?: PartType[] }) {
  const plugin = PLUGINS[domain];
  const rows = useMemo(() => {
    if (domain === "lego") {
      const colors = [...LEGO_COLORS];
      for (const it of inventory.items) if (it.color && !colors.includes(it.color)) colors.push(it.color);
      return [...plugin.vocabulary.flatMap((p) => colors.map((c) => ({ partType: p.id, name: p.name, color: c }))), ...extraParts.map((p) => ({ partType: p.id, name: p.name, color: undefined as string | undefined }))];
    }
    return [...plugin.vocabulary.map((p) => ({ partType: p.id, name: p.name, color: undefined as string | undefined })), ...extraParts.map((p) => ({ partType: p.id, name: p.name, color: undefined as string | undefined }))];
  }, [domain, plugin, extraParts, inventory.items]);

  const confOf = (partType: string, color?: string) => {
    const rows = inventory.items.filter((it) => it.partType === partType && (it.color ?? "") === (color ?? ""));
    if (!rows.length) return undefined;
    return Math.min(...rows.map((it) => it.conf));
  };

  const qtyOf = (partType: string, color?: string) =>
    inventory.items.filter((it) => it.partType === partType && (it.color ?? "") === (color ?? "")).reduce((s, it) => s + it.qty, 0);

  const nonZero = rows.filter((r) => qtyOf(r.partType, r.color) > 0);
  const zero = rows.filter((r) => qtyOf(r.partType, r.color) === 0);

  const Row = ({ r }: { r: (typeof rows)[number] }) => {
    const q = qtyOf(r.partType, r.color);
    const conf = q > 0 ? confOf(r.partType, r.color) : undefined;
    return (
      <li className="flex items-center gap-2 py-1">
        {r.color && <span className="inline-block w-3 h-3 rounded-sm border" style={{ background: cssColor(r.color), borderColor: "var(--line)" }} />}
        <span className="text-sm flex-1 truncate">
          {r.name}
          {r.color ? <span className="muted"> · {r.color}</span> : null}
        </span>
        {conf !== undefined && conf < 1 && (
          <span className="mono text-xs muted" title="model confidence 0..1">
            {conf.toFixed(2)}
          </span>
        )}
        <button className="btn sm" onClick={() => onChange(withQty(inventory, r.partType, Math.max(0, q - 1), r.color))}>
          −
        </button>
        <span className="mono w-6 text-center text-sm">{q}</span>
        <button className="btn sm" onClick={() => onChange(withQty(inventory, r.partType, q + 1, r.color))}>
          +
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm muted">
          {inventory.items.reduce((s, it) => s + it.qty, 0)} parts · {inventory.items.length} types · source <span className="mono">{inventory.sourceId}</span>
        </div>
        <button className="btn sm" onClick={() => onChange({ ...inventory, items: [] })}>
          Clear
        </button>
      </div>
      {nonZero.length > 0 && (
        <ul className="panel px-3 py-1 divide-y" style={{ borderColor: "var(--line)" }}>
          {nonZero.map((r) => (
            <Row key={`${r.partType}|${r.color ?? ""}`} r={r} />
          ))}
        </ul>
      )}
      <details className="panel px-3 py-2">
        <summary className="text-sm muted cursor-pointer">Add parts ({zero.length})</summary>
        <ul className="max-h-72 overflow-auto mt-2">
          {zero.map((r) => (
            <Row key={`${r.partType}|${r.color ?? ""}`} r={r} />
          ))}
        </ul>
      </details>
    </div>
  );
}

export function cssColor(name: string): string {
  const map: Record<string, string> = {
    red: "#c8102e",
    blue: "#0055bf",
    yellow: "#f2cd37",
    white: "#f4f4f4",
    black: "#1b1b1b",
    green: "#237841",
    "light gray": "#a0a5a9",
    "dark gray": "#6c6e68",
    tan: "#e4cd9e",
    orange: "#fe8a18",
    "bright green": "#4b9f4a",
    lime: "#bbe90b",
    coral: "#ff698f",
    "bright pink": "#e4adc8",
    "reddish brown": "#582a12",
    "medium azure": "#36aebf",
    "trans clear": "#e0f0f7",
    "trans orange": "#f8bb3d",
  };
  if (map[name]) return map[name];
  const code = Number(Object.entries(LDRAW_COLORS).find(([, v]) => v === name)?.[0]);
  return Number.isFinite(code) ? "#888" : "#888";
}
