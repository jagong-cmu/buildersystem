"use client";
import { DOMAIN_IDS } from "@/domains";
import { useDomain } from "@/lib/inventory-store";
import { DOMAIN_LABEL } from "@/lib/format";

export function DomainSwitch() {
  const [domain, setDomain] = useDomain();
  return (
    <div className="flex gap-1 p-1 rounded-lg" style={{ background: "var(--panel-2)" }}>
      {DOMAIN_IDS.map((d) => (
        <button
          key={d}
          onClick={() => setDomain(d)}
          className="px-3 py-1 rounded-md text-sm"
          style={domain === d ? { background: "var(--accent)", color: "#111", fontWeight: 600 } : { color: "var(--muted)" }}
        >
          {DOMAIN_LABEL[d]}
        </button>
      ))}
    </div>
  );
}
