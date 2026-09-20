"use client";
// Focused step-by-step guide (PRD §5.4): the renderer fills the stage, one step at a time.
// Steps transition with a directional slide; parts, subs and probes live in a side drawer.
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
import { AutoVerify } from "@/lib/auto-verify";
import { detectionsFor, useDetections } from "@/lib/detections";
import { keyOf, locationPhrase } from "@/lib/live-inventory";
import { usePrimarySource } from "@/lib/sources";
import { FrameOverlay } from "./FrameOverlay";
import { LiveFeed } from "./LiveFeed";
import { useAutoVerifyPref } from "./useHandsFree";
import { useLiveInventory } from "./useLiveInventory";

const ADVANCE_SECONDS = 3;

const BADGE: Record<VerifyStatus, { cls: string; label: string }> = {
  pending: { cls: "", label: "" },
  armed: { cls: "info", label: "ready to check" },
  checking: { cls: "info", label: "checking…" },
  verified: { cls: "ok", label: "✓ verified" },
  mismatch: { cls: "warn", label: "✗ not yet" },
  unsure: { cls: "", label: "couldn't confirm" },
};

interface GuideProgress {
  active: number;
  verify: Record<number, VerifyResult>;
}

const PROGRESS_KEY = (manualId: string) => `rc:guide:${manualId}`;

function readProgress(manualId: string): GuideProgress | null {
  try {
    const raw = sessionStorage.getItem(PROGRESS_KEY(manualId));
    return raw ? (JSON.parse(raw) as GuideProgress) : null;
  } catch {
    return null;
  }
}

function writeProgress(manualId: string, progress: GuideProgress) {
  try {
    sessionStorage.setItem(PROGRESS_KEY(manualId), JSON.stringify(progress));
  } catch {
    /* private mode etc. */
  }
}

interface PlanBanner {
  fromStep: number;
  unresolved: Requirement[];
  subs: { note: string }[];
  until: number;
}

interface SavedBuild {
  url?: string;
  qrSvg?: string;
  error?: string;
  failed: { name: string; error: string }[];
}

export function ScrollGuide({ initial, dropbox }: { initial: Manual; dropbox: boolean }) {
  const [manual, setManual] = useState(initial);
  const plugin = PLUGINS[manual.domain];
  const Renderer = RENDERERS[manual.domain];
  const [inventory] = useInventory(manual.domain);
  const match = useMemo(() => matchManual(inventory, manual, plugin.substitutions, MATCH_DEFAULTS[manual.domain], plugin), [inventory, manual, plugin]);

  const [active, setActive] = useState(0);
  const progressLoaded = useRef(false);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  // PiP is on by default whenever a glasses source is online; the button overrides.
  const { glassesOnline, sourceId: primaryId } = usePrimarySource();
  const [liveOverride, setLiveOverride] = useState<boolean | null>(null);
  const live = liveOverride ?? glassesOnline;
  const detections = useDetections();
  // Keep detections flowing on the guide (overlay + "In your view") without touching the inventory.
  useLiveInventory({ domain: manual.domain, enabled: live, writeInventory: false });
  const [autoVerifyOn] = useAutoVerifyPref();
  const autoVerify = useRef(new AutoVerify());
  const [countdown, setCountdown] = useState<{ step: number; left: number } | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestCheck = useRef<(step: number, auto?: boolean) => Promise<void>>(async () => {});
  const [drawer, setDrawer] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [verify, setVerify] = useState<Record<number, VerifyResult>>({});
  const armedAt = useRef<Record<number, number>>({});
  const snapshot = useRef<(() => Promise<Blob | null>) | null>(null);
  const activeRef = useRef(active);
  const verifyRef = useRef(verify);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [banner, setBanner] = useState<PlanBanner | null>(null);
  const [subs, setSubs] = useState<AppliedSub[]>(match.subs);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedBuild | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const startedAt = useRef<number | null>(null);
  const registerSnapshot = useCallback((fn: () => Promise<Blob | null>) => {
    snapshot.current = fn;
  }, []);

  const total = manual.steps.length;

  const goTo = useCallback((i: number) => {
    const next = Math.max(0, Math.min(total, i));
    setActive((prev) => {
      if (prev !== next) setDirection(next > prev ? "forward" : "back");
      return next;
    });
    setMissingOpen(false);
  }, [total]);

  // Arm the step for verification and tell the hub (narration / TTS on the glasses bridge).
  useEffect(() => {
    if (active > 0) {
      armedAt.current[active] ??= Date.now();
      const s = manual.steps[active - 1];
      sendControl({ type: "step.activated", manualId: manual.id, step: active, text: s.text });
      sendControl({ type: "say", text: `Step ${active}. ${s.text}` });
    }
  }, [active, manual]);

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
    goTo(result.fromStep);
    sendControl({ type: "say", text: `Plan updated from step ${result.fromStep}.` });
  }, [have, inventory, manual, plugin, goTo]);

  const latestReportMissing = useRef(reportMissing);
  useEffect(() => {
    latestReportMissing.current = reportMissing;
  }, [reportMissing]);

  useEffect(() => {
    activeRef.current = active;
    verifyRef.current = verify;
  }, [active, verify]);

  useEffect(() => {
    autoVerify.current.enabled = autoVerifyOn;
  }, [autoVerifyOn]);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);
  useEffect(() => {
    autoVerify.current.setStep(active > 0 ? active : null);
  }, [active]);

  useEffect(() => {
    return subscribeControl((msg) => {
      if (msg.type === "motion" && msg.source === primaryId && (msg.state === "active" || msg.state === "settled")) {
        const step = autoVerify.current.onMotion(msg.state);
        if (step != null) void latestCheck.current(step, true);
        return;
      }
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
  }, [primaryId]);

  useEffect(() => () => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
  }, []);

  // Progress survives a reload within the tab (PRD §16: no database).
  useEffect(() => {
    const timer = setTimeout(() => {
      const saved = readProgress(initial.id);
      if (saved) {
        setActive(Math.max(0, Math.min(initial.steps.length, saved.active)));
        setVerify(saved.verify ?? {});
      }
      progressLoaded.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, [initial]);
  useEffect(() => {
    if (progressLoaded.current) writeProgress(initial.id, { active, verify });
  }, [initial.id, active, verify]);

  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get("step"));
    if (n > 0) queueMicrotask(() => goTo(n));
  }, [goTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "j" || e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goTo(active + 1);
      }
      if (e.key === "k" || e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(active - 1);
      }
      if (e.key === "Escape") {
        setDrawer(false);
        setMissingOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, goTo]);

  /** Speak the outcome and, on verified, count down and advance (PRD §14.3 hands-free). */
  const startCountdown = useCallback((step: number) => {
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    setCountdown({ step, left: ADVANCE_SECONDS });
    countdownTimer.current = setInterval(() => {
      setCountdown((c) => {
        if (!c) return null;
        if (c.left <= 1) {
          if (countdownTimer.current) clearInterval(countdownTimer.current);
          countdownTimer.current = null;
          goTo(c.step + 1);
          return null;
        }
        return { ...c, left: c.left - 1 };
      });
    }, 1000);
  }, [goTo]);
  useEffect(() => () => {
    if (countdownTimer.current) clearInterval(countdownTimer.current);
  }, []);

  const settle = useCallback((step: number, r: VerifyResult) => {
    setVerify((v) => ({ ...v, [step]: r }));
    if (r.status === "verified") {
      if (step >= total) {
        sendControl({ type: "say", text: `Step ${step} verified. Build complete.` });
        return;
      }
      sendControl({ type: "say", text: `Step ${step} verified. Next step in ${ADVANCE_SECONDS} seconds.` });
      startCountdown(step);
    } else if (r.status === "mismatch") {
      sendControl({ type: "say", text: r.hint ? `Not yet. ${r.hint}` : `Step ${step} doesn't match yet.` });
    } else if (r.status === "unsure") {
      sendControl({ type: "say", text: `Couldn't confirm step ${step}. Try holding still with the build in view.` });
    }
  }, [total, startCountdown]);

  const captureStepEvidence = useCallback((step: number) => {
    fetch("/api/evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manualId: manual.id, step, armedAt: armedAt.current[step] }),
    }).then(async (response) => {
      if (!response.ok) return;
      const body = (await response.json()) as { evidence?: VerifyResult["evidence"] };
      if (body.evidence) {
        setVerify((current) => ({
          ...current,
          [step]: { ...current[step], evidence: body.evidence },
        }));
      }
    }).catch(() => {});
  }, [manual.id]);

  const check = useCallback(async (step: number, auto = false) => {
    if (autoVerify.current.checking) return;
    autoVerify.current.setChecking(true);
    setVerify((v) => ({ ...v, [step]: { manualId: manual.id, step, status: "checking" } }));
    sendControl({ type: "check", step });
    if (auto) sendControl({ type: "say", text: `Checking step ${step}.` });
    try {
      if (manual.steps[step - 1]?.expected.probes?.length) {
        const hardware = await hardwareVerifier.verify(manual.id, manual.steps[step - 1] as Step<BoardPlacement>, { hubHttp: HUB_HTTP });
        if (hardware.status !== "unsure") {
          settle(step, hardware);
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
      settle(step, r);
    } catch (e) {
      settle(step, { manualId: manual.id, step, status: "unsure", hint: (e as Error).message });
    } finally {
      autoVerify.current.setChecking(false);
    }
  }, [captureStepEvidence, manual, settle]);
  useEffect(() => {
    latestCheck.current = check;
  }, [check]);

  function markDone(step: number) {
    setVerify((v) => ({ ...v, [step]: { manualId: manual.id, step, status: "verified", hint: "marked by builder" } }));
    captureStepEvidence(step);
    if (step < total) {
      sendControl({ type: "say", text: `Step ${step} done.` });
      goTo(step + 1);
    } else {
      sendControl({ type: "say", text: "Build complete." });
    }
  }

  async function saveBuild() {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/dropbox/builds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          manualId: manual.id,
          manualSnapshot: manual,
          verify,
          subs,
          startedAt: startedAt.current ?? Date.now(),
        }),
      });
      const body = (await response.json()) as SavedBuild & { error?: string };
      if (!response.ok) throw new Error(body.error ?? `save failed (${response.status})`);
      if (!body.url) {
        setSaved(null);
        setSaveError(body.error ?? "Upload failed");
        return;
      }
      setSaved(body);
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const allVerified = total > 0 && manual.steps.every((s) => verify[s.n]?.status === "verified");
  const step = active > 0 ? manual.steps[active - 1] : null;
  const status: VerifyStatus = step ? (verify[step.n]?.status ?? "armed") : "pending";
  const highlight = useMemo(() => {
    const keys = new Set<string>();
    step?.callouts.forEach((c) => {
      keys.add(keyOf(c));
      keys.add(`${c.partType}|`);
    });
    return keys;
  }, [step]);
  const inView = useMemo(
    () =>
      (step?.callouts ?? []).map((c) => {
        const seen = detectionsFor(detections.items, c.partType, c.color).filter((d) => d.bbox && !d.misses);
        const where = seen.length ? locationPhrase(seen[0].bbox!) : null;
        return { req: c, where, qty: seen.reduce((s, d) => s + d.qty, 0) };
      }),
    [step, detections.items],
  );
  const missingCount = manual.requires.filter((r) => have(r.partType, r.color) < r.qty).length;
  const doneCount = Object.values(verify).filter((v) => v.status === "verified").length;

  return (
    <div className="stage">
      <div className="absolute inset-0">
        <Renderer manual={manual as never} step={active} direction={direction} registerSnapshot={registerSnapshot} />
      </div>
      <div className="stage-vignette" />

      <div className="progress">
        <div className="progress-fill" style={{ width: `${(active / total) * 100}%` }} />
      </div>

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 p-4 flex items-start gap-3 pointer-events-none">
        <div className="viewport-title pointer-events-auto">
          <Link href="/builds" className="mono muted text-xs hover:underline">← builds · {DOMAIN_LABEL[manual.domain]}</Link>
          <span className="font-medium">{manual.title}</span>
        </div>
        <div className="ml-auto flex items-center gap-2 pointer-events-auto">
          {countdown && (
            <span className="chip ok" title="auto-advancing">
              verified · next in {countdown.left}s
              <button
                className="underline ml-1"
                onClick={() => {
                  if (countdownTimer.current) clearInterval(countdownTimer.current);
                  setCountdown(null);
                }}
              >
                stay
              </button>
            </span>
          )}
          {dropbox && !saved && <button className="btn sm" disabled={saving} onClick={saveBuild}>{saving ? "Saving…" : "Save build"}</button>}
          <button className={`btn sm${live ? " primary" : ""}`} onClick={() => setLiveOverride(!live)}>{live ? "hide live" : "live"}</button>
          <button className={`btn sm${drawer ? " primary" : ""}`} onClick={() => setDrawer((d) => !d)}>
            details{missingCount > 0 && <span className="dot warn" aria-label={`${missingCount} missing`} />}
          </button>
        </div>
      </div>

      {banner && (banner.until > 0 || banner.unresolved.length > 0) && (
        <div className="plan-banner panel px-4 py-2 text-sm shadow-xl">
          {banner.until > 0 && <div className="font-medium">Plan updated from step {banner.fromStep}</div>}
          {banner.until > 0 && banner.subs.map((sub, i) => <div key={i} className="muted text-xs">{sub.note}</div>)}
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
        <div className="live-pip shadow-xl space-y-2">
          <LiveFeed
            compact
            overlay={(frame) => (
              <FrameOverlay domain={manual.domain} detections={detections.items} frame={frame ?? detections.frame} highlight={highlight} dimOthers labels="highlight" />
            )}
          />
          {step && step.callouts.length > 0 && (
            <div className="panel px-3 py-2 text-xs space-y-1" data-testid="in-your-view">
              <div className="muted font-medium">In your view</div>
              {inView.map(({ req, where, qty }, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: where ? "var(--accent)" : "var(--line)" }} />
                  <span className={where ? "" : "muted"}>
                    {reqLabel(manual.domain, req)} — {where ?? "not in view"}
                    {where && qty < req.qty ? ` (${qty} seen)` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Side arrows */}
      <button className="stage-arrow left" disabled={active === 0} onClick={() => goTo(active - 1)} aria-label="previous step">‹</button>
      <button className="stage-arrow right" disabled={active === total} onClick={() => goTo(active + 1)} aria-label="next step">›</button>

      {/* Step card */}
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 flex flex-col items-center gap-3 pointer-events-none">
        <div key={active} className={`step-sheet panel pointer-events-auto ${direction === "forward" ? "from-right" : "from-left"}`}>
          {step ? (
            <>
              <div className="flex items-center gap-3">
                <span className={`step-num active${status === "verified" ? " done" : ""}`}>{status === "verified" ? "✓" : step.n}</span>
                <h2 className="text-lg font-semibold leading-tight">{step.title}</h2>
                {status !== "pending" && <span className={`chip ${BADGE[status].cls} ml-auto shrink-0`}>{BADGE[status].label}</span>}
              </div>
              <p className="step-text">{step.text}</p>
              {step.callouts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {step.callouts.map((c, i) => (
                    <span key={i} className="chip">{reqLabel(manual.domain, c)}</span>
                  ))}
                </div>
              )}
              {verify[step.n]?.hint && <div className="muted text-sm">{verify[step.n].hint}</div>}
              <div className="flex items-center gap-2 pt-1">
                <button className="btn sm" disabled={status === "checking"} onClick={() => check(step.n)}>Check</button>
                <button className="btn sm primary" onClick={() => markDone(step.n)}>{step.n === total ? "Finish" : "Mark done →"}</button>
                <div className="ml-auto relative">
                  <button className="text-xs muted hover:underline cursor-pointer" onClick={() => setMissingOpen((o) => !o)}>Missing a part?</button>
                  {missingOpen && (
                    <div className="absolute right-0 bottom-full mb-2 z-20 panel p-2 flex flex-wrap gap-1.5 min-w-48 shadow-xl">
                      {step.callouts.map((callout, i) => (
                        <button key={i} className="btn sm" onClick={() => reportMissing(step.n, callout)}>{reqLabel(manual.domain, callout)}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3">
                {manual.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={manual.thumbnail} alt="" className="w-16 h-16 shrink-0 object-contain rounded-md" style={{ background: "#0f1318", border: "1px solid var(--line)" }} />
                )}
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold leading-tight">{manual.title}</h1>
                  <p className="muted text-sm">{manual.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="chip">{total} steps</span>
                <span className="chip">~{manual.estMinutes} min</span>
                <span className={`chip ${match.status === "buildable" ? "ok" : match.status === "with-subs" ? "info" : "warn"}`}>{match.status}</span>
                {missingCount > 0 && <button className="chip warn cursor-pointer" onClick={() => setDrawer(true)}>{missingCount} missing · view parts</button>}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button className="btn primary" onClick={() => goTo(1)}>Start building →</button>
                <button className="btn" onClick={() => setDrawer(true)}>Parts list</button>
              </div>
            </>
          )}
        </div>
        {dropbox && allVerified && !saved && (
          <div className="panel pointer-events-auto p-3 text-left space-y-2 w-full max-w-lg">
            <div className="font-medium">Save this build to Dropbox?</div>
            <div className="flex items-center gap-2">
              <button className="btn primary sm" disabled={saving} onClick={saveBuild}>{saving ? "Saving…" : "Save build"}</button>
              {saveError && <span className="chip warn">{saveError}</span>}
            </div>
          </div>
        )}
        {saved && (
          <div className="panel pointer-events-auto p-3 text-left space-y-2 w-full max-w-lg">
            <div className="font-medium">Build saved to Dropbox</div>
            {saved.url && <a className="underline break-all" href={saved.url} target="_blank" rel="noreferrer">{saved.url}</a>}
            {saved.qrSvg && <div className="w-40 h-40 bg-white p-2" dangerouslySetInnerHTML={{ __html: saved.qrSvg }} />}
            {saved.failed.length > 0 && <div className="chip warn">{saved.failed.length} files failed</div>}
          </div>
        )}
        <div className="step-dots pointer-events-auto" role="tablist" aria-label="steps">
          {manual.steps.map((s) => (
            <button
              key={s.n}
              role="tab"
              aria-selected={active === s.n}
              aria-label={`step ${s.n}`}
              className={`step-dot${active === s.n ? " active" : ""}${verify[s.n]?.status === "verified" ? " done" : ""}`}
              onClick={() => goTo(s.n)}
            />
          ))}
        </div>
        <span className="muted text-xs">
          {active === total && doneCount === total ? "Done. Put it to use." : "← → or j / k to move between steps"}
        </span>
      </div>

      {/* Details drawer */}
      <div className={`drawer-scrim${drawer ? " open" : ""}`} onClick={() => setDrawer(false)} />
      <aside className={`drawer${drawer ? " open" : ""}`} aria-hidden={!drawer}>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="font-semibold">Details</h3>
          <button className="btn sm ml-auto" onClick={() => setDrawer(false)}>close</button>
        </div>
        <div className="space-y-5 text-sm">
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="font-medium">Parts</h4>
              <span className="chip">{manual.requires.length}</span>
              {missingCount > 0 && <span className="chip warn">{missingCount} missing</span>}
            </div>
            <ul className="space-y-1">
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
            {match.subs.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {match.subs.map((s, i) => (
                  <span key={i} className="chip info" title={s.note}>↔ {s.note}</span>
                ))}
              </div>
            )}
          </section>
          {step?.expected.probes?.length ? (
            <section className="space-y-1">
              <h4 className="font-medium">Probes · step {step.n}</h4>
              <div className="muted text-xs mono">
                {step.expected.probes.map((p) => `${p.pin} ${p.mode}${p.expect.min !== undefined ? ` ∈ [${p.expect.min}, ${p.expect.max}]` : p.expect.value !== undefined ? ` = ${p.expect.value}` : ""}`).join(" · ")}
              </div>
            </section>
          ) : null}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="font-medium">Steps</h4>
              <span className="chip">{doneCount}/{total} done</span>
            </div>
            <ol className="space-y-1">
              {manual.steps.map((s) => {
                const v = verify[s.n]?.status ?? (s.n <= active ? "armed" : "pending");
                return (
                  <li key={s.n}>
                    <button
                      className={`step-row${active === s.n ? " active" : ""}`}
                      onClick={() => { goTo(s.n); setDrawer(false); }}
                    >
                      <span className={`step-num${active === s.n ? " active" : ""}${v === "verified" ? " done" : ""}`}>{v === "verified" ? "✓" : s.n}</span>
                      <span className="truncate">{s.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </aside>
    </div>
  );
}
