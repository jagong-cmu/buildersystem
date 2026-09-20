"use client";
// Scrollable step-by-step guide (PRD §5.4): sticky animated viewport + step cards.
// The card nearest the 45% line of the viewport is the active step; renderers animate to it.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { matchManual } from "@/core/matcher";
import { replan } from "@/core/replan";
import type { AppliedSub, BoardPlacement, Manual, Requirement, Step, VerifyResult, VerifyStatus } from "@/core/types";
import { hardwareVerifier } from "@/domains/breadboard/verifiers";
import { MATCH_DEFAULTS, PLUGINS } from "@/domains";
import { RENDERERS } from "@/domains/renderers";
import { DOMAIN_LABEL, reqLabel } from "@/lib/format";
import { HUB_HTTP, sendControl, subscribeControl } from "@/lib/hub";
import { useInventory } from "@/lib/inventory-store";
import { LiveFeed } from "./LiveFeed";

const BADGE: Record<VerifyStatus, { cls: string; label: string }> = {
  pending: { cls: "", label: "" },
  armed: { cls: "info", label: "ready to check" },
  checking: { cls: "info", label: "checking…" },
  verified: { cls: "ok", label: "✓ verified" },
  mismatch: { cls: "warn", label: "✗ not yet" },
  unsure: { cls: "", label: "couldn't confirm" },
};

interface PlanBanner {
  fromStep: number;
  unresolved: Requirement[];
  subs: { note: string }[];
  until: number;
}

interface SavedBuild {
  url?: string;
  qrSvg?: string;
  failed: string[];
}

export function ScrollGuide({ initial, dropbox }: { initial: Manual; dropbox: boolean }) {
  const [manual, setManual] = useState(initial);
  const plugin = PLUGINS[manual.domain];
  const Renderer = RENDERERS[manual.domain];
  const [inventory] = useInventory(manual.domain);
  const match = useMemo(() => matchManual(inventory, manual, plugin.substitutions, MATCH_DEFAULTS[manual.domain], plugin), [inventory, manual, plugin]);

  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [live, setLive] = useState(false);
  const [verify, setVerify] = useState<Record<number, VerifyResult>>({});
  const armedAt = useRef<Record<number, number>>({});
  const cards = useRef<(HTMLElement | null)[]>([]);
  const snapshot = useRef<(() => Promise<Blob | null>) | null>(null);
  const activeRef = useRef(active);
  const verifyRef = useRef(verify);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [banner, setBanner] = useState<PlanBanner | null>(null);
  const [subs, setSubs] = useState<AppliedSub[]>(match.subs);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedBuild | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const registerSnapshot = useCallback((fn: () => Promise<Blob | null>) => {
    snapshot.current = fn;
  }, []);

  // Active-step detection: the last card whose top has crossed the 40% line (scrollytelling rule).
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const line = window.innerHeight * 0.4;
        let best = 0;
        cards.current.forEach((el, i) => {
          if (el && el.getBoundingClientRect().top <= line) best = i;
        });
        setActive((prev) => {
          if (prev !== best) setDirection(best > prev ? "forward" : "back");
          return best;
        });
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Arm the step for verification and tell the hub (narration / TTS on the glasses bridge).
  useEffect(() => {
    if (active > 0) {
      armedAt.current[active] ??= Date.now();
      const s = manual.steps[active - 1];
      setVerify((v) => (v[active] ? v : { ...v, [active]: { manualId: manual.id, step: active, status: "armed" } }));
      sendControl({ type: "step.activated", manualId: manual.id, step: active, text: s.text });
      sendControl({ type: "say", text: `Step ${active}. ${s.text}` });
    }
  }, [active, manual]);

  const scrollTo = useCallback((i: number) => {
    cards.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const have = useCallback((partType: string, color?: string) =>
    inventory.items.filter((it) => it.partType === partType && (MATCH_DEFAULTS[manual.domain].colorAware ? (it.color ?? "") === (color ?? "") : true)).reduce((s, it) => s + it.qty, 0),
  [inventory.items, manual.domain]);

  const reportMissing = useCallback((step: number, req: Requirement) => {
    const completedThrough = step - 1;
    const quantity = Math.max(req.qty, have(req.partType, req.color));
    const result = replan(
      manual,
      inventory,
      completedThrough,
      [{ ...req, qty: quantity }],
      plugin.substitutions,
      MATCH_DEFAULTS[manual.domain],
    );
    setManual(result.manual);
    setSubs(result.subs);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner({ fromStep: result.fromStep, unresolved: result.unresolved, subs: result.subs, until: Date.now() + 6000 });
    bannerTimer.current = setTimeout(() => {
      setBanner((current) => current ? { ...current, until: 0 } : null);
    }, 6000);
    setVerify((current) => Object.fromEntries(Object.entries(current).filter(([n]) => Number(n) < result.fromStep)));
    scrollTo(result.fromStep);
    sendControl({ type: "say", text: `Plan updated from step ${result.fromStep}.` });
  }, [have, inventory, manual, plugin, scrollTo]);

  const latestReportMissing = useRef(reportMissing);
  useEffect(() => {
    latestReportMissing.current = reportMissing;
  }, [reportMissing]);

  useEffect(() => {
    activeRef.current = active;
    verifyRef.current = verify;
  }, [active, verify]);

  useEffect(() => {
    return subscribeControl((msg) => {
      if (msg.type !== "part.missing" || typeof msg.partType !== "string") return;
      const verified = Object.entries(verifyRef.current)
        .filter(([, result]) => result.status === "verified")
        .map(([n]) => Number(n));
      const completedThrough = verified.length > 0 ? Math.max(...verified) : activeRef.current - 1;
      const req: Requirement = {
        partType: msg.partType,
        qty: typeof msg.qty === "number" && msg.qty > 0 ? msg.qty : 1,
        ...(typeof msg.color === "string" ? { color: msg.color } : {}),
      };
      latestReportMissing.current(completedThrough + 1, req);
    });
  }, []);

  useEffect(() => () => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
  }, []);

  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get("step"));
    if (!(n > 0)) return;
    const timer = setTimeout(() => scrollTo(n), 150);
    return () => clearTimeout(timer);
  }, [scrollTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        scrollTo(Math.min(manual.steps.length, active + 1));
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        scrollTo(Math.max(0, active - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, manual.steps.length, scrollTo]);

  async function check(step: number) {
    setVerify((v) => ({ ...v, [step]: { manualId: manual.id, step, status: "checking" } }));
    sendControl({ type: "check", step });
    try {
      if (manual.steps[step - 1]?.expected.probes?.length) {
        const hardware = await hardwareVerifier.verify(manual.id, manual.steps[step - 1] as Step<BoardPlacement>, { hubHttp: HUB_HTTP });
        if (hardware.status !== "unsure") {
          setVerify((v) => ({ ...v, [step]: hardware }));
          captureStepEvidence(step);
          return;
        }
      }
      const fd = new FormData();
      fd.append("manualId", manual.id);
      fd.append("step", String(step));
      fd.append("armedAt", String(armedAt.current[step] ?? Date.now() - 30_000));
      const snap = await snapshot.current?.();
      if (snap) fd.append("expected", snap, "expected.png");
      const res = await fetch("/api/verify", { method: "POST", body: fd });
      const r = (await res.json()) as VerifyResult;
      setVerify((v) => ({ ...v, [step]: r }));
    } catch (e) {
      setVerify((v) => ({ ...v, [step]: { manualId: manual.id, step, status: "unsure", hint: (e as Error).message } }));
    }
  }
  function captureStepEvidence(step: number) {
    fetch("/api/evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manualId: manual.id, step, armedAt: armedAt.current[step] }),
    }).then(async (response) => {
      if (!response.ok) return;
      const body = (await response.json()) as { evidence?: VerifyResult["evidence"] };
      if (body.evidence) setVerify((current) => ({ ...current, [step]: { ...current[step], evidence: body.evidence } }));
    }).catch(() => {});
  }
  function markDone(step: number) {
    setVerify((v) => ({ ...v, [step]: { manualId: manual.id, step, status: "verified", hint: "marked by builder" } }));
    captureStepEvidence(step);
    if (step < manual.steps.length) scrollTo(step + 1);
  }

  async function saveBuild() {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/dropbox/builds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manualId: manual.id, manualSnapshot: manual, verify, subs, startedAt: startedAt.current }),
      });
      const body = (await response.json()) as SavedBuild & { error?: string };
      if (!response.ok) throw new Error(body.error ?? `save failed (${response.status})`);
      setSaved(body);
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const allVerified = manual.steps.length > 0 && manual.steps.every((step) => verify[step.n]?.status === "verified");

  return (
    <div className="grid lg:grid-cols-[1.25fr_1fr] gap-0 max-w-7xl mx-auto">
      {/* Sticky viewport */}
      <div className="lg:sticky lg:top-0 h-[46vh] lg:h-[calc(100vh-57px)] relative" style={{ background: "#0f1318" }}>
        <div className="absolute inset-0">
          <Renderer manual={manual as never} step={active} direction={direction} registerSnapshot={registerSnapshot} />
        </div>
        <div className="progress">
          <div className="progress-fill" style={{ width: `${(active / manual.steps.length) * 100}%` }} />
        </div>
        <div className="absolute inset-x-0 top-0 p-3 flex items-center gap-3 pointer-events-none">
          <div className="viewport-title">
            <span className="mono muted text-xs">STEP {active}/{manual.steps.length}</span>
            <span className="font-medium">{active > 0 ? manual.steps[active - 1].title : manual.title}</span>
          </div>
          <button className="btn sm ml-auto pointer-events-auto" onClick={() => setLive((l) => !l)}>
            {live ? "hide live" : "live"}
          </button>
        </div>
        {banner && (banner.until > Date.now() || banner.unresolved.length > 0) && (
          <div className="plan-banner panel px-4 py-2 text-sm shadow-xl">
            {banner.until > Date.now() && <div className="font-medium">Plan updated from step {banner.fromStep}</div>}
            {banner.until > Date.now() && banner.subs.map((sub, i) => <div key={i} className="muted text-xs">{sub.note}</div>)}
            {banner.unresolved.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="chip warn">Still missing: {banner.unresolved.map((req) => reqLabel(manual.domain, req)).join(", ")}</span>
                {plugin.commerce?.(banner.unresolved).map((link) => (
                  <a key={link.url} className="btn sm" href={link.url} target="_blank" rel="noreferrer">{link.label}</a>
                ))}
              </div>
            )}
          </div>
        )}
        {live && (
          <div className="absolute right-3 bottom-3 w-64 shadow-xl">
            <LiveFeed compact />
          </div>
        )}
        <div className="absolute bottom-3 inset-x-0 flex flex-col items-center gap-1">
          <div className="flex gap-2">
            <button className="btn sm" disabled={active === 0} onClick={() => scrollTo(Math.max(0, active - 1))}>← prev</button>
            <button className="btn sm" disabled={active === manual.steps.length} onClick={() => scrollTo(Math.min(manual.steps.length, active + 1))}>next →</button>
          </div>
          <span className="muted text-xs">scroll or press j / k</span>
        </div>
      </div>

      {/* Cards */}
      <div className="px-5 py-6 space-y-4">
        <header ref={(el) => { cards.current[0] = el; }} className="panel p-4 space-y-3 scroll-mt-[38vh]">
          <div className="flex items-center gap-2 text-sm muted">
            <Link href="/builds" className="underline">builds</Link> · {DOMAIN_LABEL[manual.domain]}
            {dropbox && !saved && <button className="btn sm ml-auto" disabled={saving} onClick={saveBuild}>{saving ? "Saving…" : "Save build"}</button>}
          </div>
          <div className="flex items-start gap-3">
            {manual.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={manual.thumbnail} alt="" className="w-24 h-24 shrink-0 object-contain rounded-md" style={{ background: "#0f1318", border: "1px solid var(--line)" }} />
            )}
            <div>
              <h1 className="text-2xl font-semibold">{manual.title}</h1>
              <p className="muted">{manual.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="chip">{manual.steps.length} steps</span>
            <span className="chip">~{manual.estMinutes} min</span>
            <span className={`chip ${match.status === "buildable" ? "ok" : match.status === "with-subs" ? "info" : "warn"}`}>{match.status}</span>
          </div>
          <details open={match.status !== "buildable"}>
            <summary className="text-sm font-medium cursor-pointer">Parts · {manual.requires.length}</summary>
            <ul className="text-sm grid sm:grid-cols-2 gap-x-4">
              {manual.requires.map((r, i) => {
                const h = have(r.partType, r.color);
                const ok = h >= r.qty;
                return (
                  <li key={i} className="flex items-center gap-2">
                    <span className={ok ? "text-[var(--ok)]" : "text-[var(--warn)]"}>{ok ? "✓" : "✗"}</span>
                    <span>{reqLabel(manual.domain, r)}</span>
                    {!ok && <span className="muted">(have {h})</span>}
                  </li>
                );
              })}
            </ul>
          </details>
          {match.subs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {match.subs.map((s, i) => (
                <span key={i} className="chip info" title={s.note}>↔ {s.note}</span>
              ))}
            </div>
          )}
        </header>

        {manual.steps.map((s) => {
          const v = verify[s.n]?.status ?? "pending";
          const isActive = active === s.n;
          return (
            <section
              key={s.n}
              ref={(el) => { cards.current[s.n] = el; }}
              className={`step-card panel p-4 space-y-3 scroll-mt-[38vh]${isActive ? " is-active" : ""}${v === "verified" ? " is-done" : ""}`}
            >
              <div className="flex items-center gap-3">
                <span className={`step-num${isActive ? " active" : ""}${v === "verified" ? " done" : ""}`}>{v === "verified" ? "✓" : s.n}</span>
                <h2 className="font-semibold">{s.title}</h2>
                {v !== "pending" && <span className={`chip ${BADGE[v].cls} ml-auto`}>{BADGE[v].label}</span>}
              </div>
              <p className="step-text">{s.text}</p>
              {s.callouts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {s.callouts.map((c, i) => (
                    <span key={i} className="chip">{reqLabel(manual.domain, c)}</span>
                  ))}
                </div>
              )}
              {s.expected.probes?.length ? (
                <div className="muted text-xs mono">
                  probes: {s.expected.probes.map((p) => `${p.pin} ${p.mode}${p.expect.min !== undefined ? ` ∈ [${p.expect.min}, ${p.expect.max}]` : p.expect.value !== undefined ? ` = ${p.expect.value}` : ""}`).join(" · ")}
                </div>
              ) : null}
              {verify[s.n]?.hint && <div className="muted text-sm">{verify[s.n].hint}</div>}
              <div className="flex items-center gap-2">
                <button className="btn sm" disabled={v === "checking"} onClick={() => check(s.n)}>Check</button>
                <button className={`btn sm${isActive ? " primary" : ""}`} onClick={() => markDone(s.n)}>Mark done</button>
                <details className="ml-auto relative">
                  <summary className="cursor-pointer text-xs muted">Missing a part?</summary>
                  <div className="absolute right-0 mt-1 z-20 panel p-2 flex flex-wrap gap-1.5 min-w-48">
                    {s.callouts.map((callout, i) => (
                      <button key={i} className="btn sm" onClick={() => reportMissing(s.n, callout)}>{reqLabel(manual.domain, callout)}</button>
                    ))}
                  </div>
                </details>
              </div>
            </section>
          );
        })}
        <div className="panel p-4 text-center muted space-y-3">
          <div>Done. Put it to use.</div>
          {dropbox && allVerified && !saved && (
            <div className="panel p-3 text-left space-y-2">
              <div className="font-medium">Save this build to Dropbox?</div>
              <div className="flex items-center gap-2">
                <button className="btn primary sm" disabled={saving} onClick={saveBuild}>{saving ? "Saving…" : "Save build"}</button>
                {saveError && <span className="chip warn">{saveError}</span>}
              </div>
            </div>
          )}
          {saved && (
            <div className="panel p-3 text-left space-y-2">
              <div className="font-medium">Build saved to Dropbox</div>
              {saved.url && <a className="underline break-all" href={saved.url} target="_blank" rel="noreferrer">{saved.url}</a>}
              {saved.qrSvg && <div className="w-40 h-40 bg-white p-2" dangerouslySetInnerHTML={{ __html: saved.qrSvg }} />}
              {saved.failed.length > 0 && <div className="chip warn">{saved.failed.length} files failed</div>}
            </div>
          )}
        </div>
        <div aria-hidden className="h-[55vh]" />
      </div>
    </div>
  );
}
