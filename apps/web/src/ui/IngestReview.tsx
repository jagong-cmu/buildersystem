"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getPlugin } from "@/domains";
import type { DomainId } from "@/core/types";

type DraftStep = {
  n?: number;
  text: string;
  partsUsed: { name: string; qty: number }[];
  region: { page: number; bbox: [number, number, number, number] };
  cautions?: string[];
  confidence: number;
};
type Draft = { steps: DraftStep[]; mappings: { name: string; partTypeId: string | null; confidence: number }[]; pageCount: number; detectedDomain?: string; meta?: { title: string; description: string; estMinutes: number } };

export function IngestReview({ domain, id }: { domain: DomainId; id: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const vocabulary = useMemo(() => getPlugin(domain).vocabulary, [domain]);
  const step = draft?.steps[selected];
  const page = step?.region.page ?? 1;

  async function load() {
    const response = await fetch(`/api/dropbox/ingest?domain=${domain}&id=${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error((await response.json()).error);
    setDraft(await response.json());
  }
  useEffect(() => {
    load().catch((reason) => setError((reason as Error).message));
  }, [domain, id]);

  function updateStep(patch: Partial<DraftStep>) {
    if (!draft) return;
    setDraft({ ...draft, steps: draft.steps.map((item, index) => index === selected ? { ...item, ...patch } : item) });
  }
  async function reparse() {
    setBusy(true);
    try {
      const response = await fetch("/api/dropbox/ingest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain, id }) });
      if (!response.ok) throw new Error((await response.json()).error);
      setDraft(await response.json());
      setError(null);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!draft) return;
    setBusy(true);
    try {
      const response = await fetch("/api/dropbox/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain, id, draft }) });
      if (!response.ok) throw new Error((await response.json()).error);
      router.push("/library");
    } finally {
      setBusy(false);
    }
  }
  function mergeNext() {
    if (!draft || selected >= draft.steps.length - 1) return;
    const next = draft.steps[selected + 1];
    updateStep({ text: `${step?.text ?? ""} ${next.text}`.trim(), partsUsed: [...(step?.partsUsed ?? []), ...next.partsUsed] });
    setDraft({ ...draft, steps: draft.steps.filter((_, index) => index !== selected + 1) });
  }
  function split() {
    if (!draft || !step) return;
    setDraft({ ...draft, steps: [...draft.steps.slice(0, selected + 1), { ...step, text: "", partsUsed: [] }, ...draft.steps.slice(selected + 1)] });
  }
  if (!draft) return <div className="panel p-5 space-y-3"><h1 className="font-semibold">Document ingestion</h1>{error && <p className="chip warn">{error}</p>}<button className="btn primary" disabled={busy} onClick={() => reparse().catch((reason) => setError((reason as Error).message))}>Ingest PDF</button></div>;
  return (
    <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5 p-5 max-w-7xl mx-auto">
      <section className="panel p-4 space-y-3">
        <div className="flex items-center justify-between"><h1 className="font-semibold">{draft.meta?.title ?? id}</h1><span className="muted text-sm">page {page} / {draft.pageCount}</span></div>
        <div className="relative overflow-hidden rounded border" style={{ borderColor: "var(--line)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/manuals/${domain}/${id}/page/${page}`} alt={`Page ${page}`} className="w-full" />
          {step && <div className="absolute border-2 border-cyan-300" style={{ left: `${step.region.bbox[0] * 100}%`, top: `${step.region.bbox[1] * 100}%`, width: `${step.region.bbox[2] * 100}%`, height: `${step.region.bbox[3] * 100}%` }} />}
        </div>
        <div className="flex gap-2"><button className="btn sm" disabled={page <= 1} onClick={() => setSelected(Math.max(0, selected - 1))}>← previous step</button><button className="btn sm" disabled={page >= draft.pageCount} onClick={() => setSelected(Math.min(draft.steps.length - 1, selected + 1))}>next step →</button></div>
      </section>
      <section className="panel p-4 space-y-4">
        <div className="flex gap-2 flex-wrap">{draft.steps.map((item, index) => <button key={index} className={`chip ${index === selected ? "info" : ""}`} onClick={() => setSelected(index)}>step {index + 1}</button>)}</div>
        {step && <div className="space-y-3">
          <textarea className="w-full rounded border bg-transparent p-2" rows={4} value={step.text} onChange={(event) => updateStep({ text: event.target.value })} />
          <div className={`chip ${step.confidence < 0.7 ? "warn" : "ok"}`}>confidence {(step.confidence * 100).toFixed(0)}%</div>
          {step.partsUsed.map((part, index) => <div className="flex gap-2 items-center" key={index}>
            <input className="input flex-1" value={part.name} onChange={(event) => updateStep({ partsUsed: step.partsUsed.map((item, i) => i === index ? { ...item, name: event.target.value } : item) })} />
            <input className="input w-16" type="number" min={1} value={part.qty} onChange={(event) => updateStep({ partsUsed: step.partsUsed.map((item, i) => i === index ? { ...item, qty: Number(event.target.value) } : item) })} />
            <select className="input" value={draft.mappings.find((mapping) => mapping.name === part.name)?.partTypeId ?? ""} onChange={(event) => setDraft({ ...draft, mappings: [...draft.mappings.filter((mapping) => mapping.name !== part.name), { name: part.name, partTypeId: event.target.value || null, confidence: 1 }] })}>
              <option value="">extra part (ext:)</option>{vocabulary.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>)}
          <div className="flex gap-2 flex-wrap"><button className="btn sm" onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, index) => index !== selected) })}>delete</button><button className="btn sm" onClick={mergeNext}>merge with next</button><button className="btn sm" onClick={split}>split</button></div>
        </div>}
        <div className="flex gap-2"><button className="btn" disabled={busy} onClick={() => reparse().catch(() => undefined)}>Re-parse</button><button className="btn primary" disabled={busy} onClick={() => publish().catch(() => undefined)}>Publish</button></div>
      </section>
    </div>
  );
}
