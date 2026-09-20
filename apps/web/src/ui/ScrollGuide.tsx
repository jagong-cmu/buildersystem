"use client";
// Scrollable step-by-step guide (PRD §5.4): sticky animated viewport + step cards.
// The card nearest the 45% line of the viewport is the active step; renderers animate to it.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { matchManual } from "@/core/matcher";
import { replan } from "@/core/replan";
import type { BoardPlacement, Manual, Requirement, Step, VerifyResult, VerifyStatus } from "@/core/types";
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

export function ScrollGuide({ initial }: { initial: Manual }) {
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

  // Deep link + keyboard.
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get("step"));
    if (n > 0) setTimeout(() => scrollTo(n), 150);
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
  function markDone(step: number) {
    setVerify((v) => ({ ...v, [step]: { manualId: manual.id, step, status: "verified", hint: "marked by builder" } }));
    if (step < manual.steps.length) scrollTo(step + 1);
  }

  return (
    <div className="grid lg:grid-cols-[1.25fr_1fr] gap-0 max-w-7xl mx-auto">
      {/* Sticky viewport */}
      <div className="lg:sticky lg:top-0 h-[46vh] lg:h-[calc(100vh-57px)] relative" style={{ background: "#0f1318" }}>
        <div className="absolute inset-0">
          <Renderer manual={manual as never} step={active} direction={direction} registerSnapshot={registerSnapshot} />
        </div>
        <div className="absolute left-3 top-3 flex gap-2 items-center">
          <span className="chip">step {active} / {manual.steps.length}</span>
          {active > 0 && <span className="chip muted">{manual.steps[active - 1].title}</span>}
        </div>
        {banner && (banner.until > Date.now() || banner.unresolved.length > 0) && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 panel px-4 py-2 text-sm shadow-xl">
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
        <div className="absolute right-3 top-3 flex gap-2">
          <button className="btn sm" onClick={() => setLive((l) => !l)}>
            {live ? "hide live" : "live"}
          </button>
        </div>
        {live && (
          <div className="absolute right-3 bottom-3 w-64 shadow-xl">
            <LiveFeed compact />
          </div>
        )}
        <div className="absolute left-3 bottom-3 flex gap-2">
          <button className="btn sm" onClick={() => scrollTo(Math.max(0, active - 1))}>← prev</button>
          <button className="btn sm" onClick={() => scrollTo(Math.min(manual.steps.length, active + 1))}>next →</button>
        </div>
      </div>

      {/* Cards */}
      <div className="px-5 py-6 space-y-4">
        <header ref={(el) => { cards.current[0] = el; }} className="panel p-4 space-y-3 scroll-mt-[38vh]">
          <div className="flex items-center gap-2 text-sm muted">
            <Link href="/builds" className="underline">builds</Link> · {DOMAIN_LABEL[manual.domain]}
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
          <div>
            <div className="text-sm font-medium mb-1">Parts</div>
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
          </div>
          {match.subs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {match.subs.map((s, i) => (
                <span key={i} className="chip info" title={s.note}>↔ {s.note}</span>
              ))}
            </div>
          )}
          <div className="muted text-xs">Scroll, or press j / k. The view on the left follows the active step.</div>
        </header>

        {manual.steps.map((s) => {
          const v = verify[s.n]?.status ?? "pending";
          const isActive = active === s.n;
          return (
            <section
              key={s.n}
              ref={(el) => { cards.current[s.n] = el; }}
              className="panel p-4 space-y-3 scroll-mt-[38vh] transition-colors"
              style={isActive ? { borderColor: "var(--accent)" } : undefined}
            >
              <div className="flex items-center gap-3">
                <span className="mono text-sm rounded-md px-2 py-0.5" style={{ background: isActive ? "var(--accent)" : "var(--panel-2)", color: isActive ? "#111" : "inherit" }}>{s.n}</span>
                <h2 className="font-semibold">{s.title}</h2>
                {v !== "pending" && <span className={`chip ${BADGE[v].cls} ml-auto`}>{BADGE[v].label}</span>}
              </div>
              {s.callouts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {s.callouts.map((c, i) => (
                    <span key={i} className="chip">{reqLabel(manual.domain, c)}</span>
                  ))}
                </div>
              )}
              <details>
                <summary className="cursor-pointer text-sm muted">Missing a part?</summary>
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {s.callouts.map((callout, i) => (
                    <button key={i} className="btn sm" onClick={() => reportMissing(s.n, callout)}>{reqLabel(manual.domain, callout)}</button>
                  ))}
                </div>
              </details>
              <p>{s.text}</p>
              {s.expected.probes?.length ? (
                <div className="muted text-xs mono">
                  probes: {s.expected.probes.map((p) => `${p.pin} ${p.mode}${p.expect.min !== undefined ? ` ∈ [${p.expect.min}, ${p.expect.max}]` : p.expect.value !== undefined ? ` = ${p.expect.value}` : ""}`).join(" · ")}
                </div>
              ) : null}
              {verify[s.n]?.hint && <div className="muted text-sm">{verify[s.n].hint}</div>}
              <div className="flex gap-2">
                <button className="btn sm" disabled={v === "checking"} onClick={() => check(s.n)}>Check</button>
                <button className="btn sm" onClick={() => markDone(s.n)}>Mark done</button>
              </div>
            </section>
          );
        })}
        <div className="panel p-4 text-center muted">Done. Put it to use.</div>
      </div>
    </div>
  );
}
