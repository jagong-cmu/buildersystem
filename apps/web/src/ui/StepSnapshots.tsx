"use client";
// Renders the manual once through steps 1..N in a small off-screen renderer and
// hands back one PNG per step. Used by state estimation on join (PRD §7.4); the
// result is cached per manual for the life of the page.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Manual } from "@/core/types";
import { RENDERERS } from "@/domains/renderers";

const SETTLE_MS = 700;
const cache = new Map<string, Map<number, Blob>>();

export function cachedStepSnapshots(manualId: string): Map<number, Blob> | undefined {
  return cache.get(manualId);
}

export function StepSnapshots({ manual, onDone }: { manual: Manual; onDone: (snaps: Map<number, Blob>) => void }) {
  const Renderer = RENDERERS[manual.domain];
  const [step, setStep] = useState(1);
  const snapshot = useRef<(() => Promise<Blob | null>) | null>(null);
  const out = useRef(new Map<number, Blob>());
  const register = useCallback((fn: () => Promise<Blob | null>) => {
    snapshot.current = fn;
  }, []);

  useEffect(() => {
    const cached = cache.get(manual.id);
    if (cached) {
      const t = setTimeout(() => onDone(cached), 0);
      return () => clearTimeout(t);
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const blob = await snapshot.current?.();
      if (cancelled) return;
      if (blob) out.current.set(step, blob);
      if (step < manual.steps.length) {
        setStep(step + 1);
      } else {
        cache.set(manual.id, out.current);
        onDone(out.current);
      }
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [manual, step, onDone]);

  if (cache.has(manual.id)) return null;
  return (
    <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, width: 320, height: 240, pointerEvents: "none" }}>
      <Renderer manual={manual as never} step={step} direction="back" registerSnapshot={register} />
    </div>
  );
}
