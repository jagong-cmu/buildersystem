"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { rankManuals } from "@/core/matcher";
import type { Manual, Match, MatchStatus } from "@/core/types";
import { MATCH_DEFAULTS, PLUGINS } from "@/domains";
import { DOMAIN_LABEL, reqLabel } from "@/lib/format";
import { useDomain, useInventory } from "@/lib/inventory-store";
import { MANUALS } from "@/lib/manuals";

const BUCKET: Record<MatchStatus, { title: string; blurb: string }> = {
  buildable: { title: "Buildable now", blurb: "Every required part is on the table." },
  "with-subs": { title: "Buildable with substitutions", blurb: "Small swaps make it work; the guide calls them out." },
  missing: { title: "Missing parts", blurb: "Shop the gap, or scan again." },
};

export function BuildsView() {
  const [domain] = useDomain();
  const [inventory] = useInventory(domain);
  const [colorAware, setColorAware] = useState<boolean>(MATCH_DEFAULTS[domain].colorAware);
  const plugin = PLUGINS[domain];

  const matches = useMemo(
    () => rankManuals(inventory, MANUALS, plugin.substitutions, { colorAware }, plugin),
    [inventory, plugin, colorAware],
  );
  const total = inventory.items.reduce((s, it) => s + it.qty, 0);

  return (
    <div className="max-w-6xl mx-auto p-5 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Possible builds · {DOMAIN_LABEL[domain]}</h1>
        <span className="muted text-sm">
          from {total} scanned parts ·{" "}
          <Link href="/scan" className="underline">
            edit inventory
          </Link>
        </span>
        {domain === "lego" && (
          <label className="ml-auto text-sm flex items-center gap-2">
            <input type="checkbox" checked={colorAware} onChange={(e) => setColorAware(e.target.checked)} />
            match colors exactly
          </label>
        )}
      </div>
      {total === 0 && (
        <div className="panel p-4 text-sm muted">
          No inventory yet. <Link href="/scan" className="underline">Scan the table</Link> or add parts by hand.
        </div>
      )}
      {(["buildable", "with-subs", "missing"] as MatchStatus[]).map((status) => {
        const group = matches.filter((m) => m.status === status);
        if (!group.length) return null;
        return (
          <section key={status} className="space-y-3">
            <div>
              <h2 className="font-semibold">{BUCKET[status].title}</h2>
              <p className="muted text-sm">{BUCKET[status].blurb}</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.map((m) => (
                <BuildCard key={m.manualId} match={m} manual={MANUALS.find((x) => x.id === m.manualId)!} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BuildCard({ match, manual }: { match: Match; manual: Manual }) {
  const plugin = PLUGINS[manual.domain];
  const links = match.missing.length && plugin.commerce ? plugin.commerce(match.missing) : [];
  const usable = match.status !== "missing";
  return (
    <div className="panel p-4 flex flex-col gap-3">
      {manual.thumbnail && (
        <div className="rounded-md overflow-hidden" style={{ background: "#0f1318", border: "1px solid var(--line)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={manual.thumbnail} alt={`${manual.title} thumbnail`} className="w-full h-36 object-contain" />
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{manual.title}</div>
          <div className="muted text-sm">{manual.description}</div>
        </div>
        <span className="chip muted whitespace-nowrap">
          {manual.steps.length} steps · {manual.estMinutes} min
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {match.status === "buildable" && <span className="chip ok">uses {Math.round(match.utilization * 100)}% of your parts</span>}
        {match.subs.map((s, i) => (
          <span key={i} className="chip info" title={s.note}>
            ↔ {reqLabel(manual.domain, s.produces)} ← {s.consumes.map((c) => reqLabel(manual.domain, c)).join(" + ")}
          </span>
        ))}
        {match.missing.map((r, i) => (
          <span key={i} className="chip warn">
            missing {reqLabel(manual.domain, r)}
          </span>
        ))}
        {match.feasibility && !match.feasibility.ok && <span className="chip warn">{match.feasibility.detail}</span>}
        {match.feasibility?.ok && manual.domain === "fabric" && <span className="chip ok">{match.feasibility.detail}</span>}
      </div>
      <div className="mt-auto flex items-center gap-2 flex-wrap">
        <Link href={`/guide/${manual.id}`} className={`btn ${usable ? "primary" : ""}`}>
          {usable ? "Open guide →" : "Preview guide"}
        </Link>
        {links.slice(0, 1).map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="btn" download={l.url.startsWith("data:") ? "wanted-list.xml" : undefined}>
            Shop the gap
          </a>
        ))}
      </div>
    </div>
  );
}
