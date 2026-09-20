import type { Probe, Step, VerifyResult, BoardPlacement } from "@/core/types";
import type { Verifier } from "@/core/plugin";

export interface ProbeReading {
  pin: string;
  mode: string;
  value: number;
}

export interface ProbeComparison {
  probe: Probe;
  reading?: ProbeReading;
  ok: boolean;
  hint: string;
}

export function describeExpect(p: Probe): string {
  if (p.expect.value !== undefined) return String(p.expect.value);
  return `${p.expect.min ?? 0}–${p.expect.max ?? 1023}`;
}

export function compareProbe(p: Probe, r?: ProbeReading): ProbeComparison {
  if (!r) {
    return { probe: p, ok: false, hint: `no reading for ${p.pin} (${p.mode})` };
  }
  const expected = describeExpect(p);
  const ok =
    p.expect.value !== undefined
      ? r.value === p.expect.value
      : r.value >= (p.expect.min ?? 0) && r.value <= (p.expect.max ?? 1023);
  return {
    probe: p,
    reading: r,
    ok,
    hint: ok ? `${p.pin} reads ${r.value} (expected ${expected})` : `${p.pin} reads ${r.value}, expected ${expected}`,
  };
}

export function compareProbes(
  probes: Probe[],
  readings: ProbeReading[],
): { status: "verified" | "mismatch"; hint: string; comparisons: ProbeComparison[] } {
  const comparisons = probes.map((probe) => {
    const reading = readings.find((candidate) => candidate.pin === probe.pin && candidate.mode === probe.mode) ??
      readings.find((candidate) => candidate.pin === probe.pin);
    return compareProbe(probe, reading);
  });
  const failing = comparisons.filter((comparison) => !comparison.ok);
  return {
    status: failing.length ? "mismatch" : "verified",
    hint: (failing.length ? failing : comparisons).map((comparison) => comparison.hint).join("; "),
    comparisons,
  };
}

export const hardwareVerifier: Verifier<BoardPlacement> = {
  id: "hardware",
  async verify(manualId: string, step: Step<BoardPlacement>): Promise<VerifyResult> {
    try {
      const response = await fetch("/api/probe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manualId, step: step.n }),
      });
      if (!response.ok) throw new Error(`probe request failed (${response.status})`);
      return (await response.json()) as VerifyResult;
    } catch (error) {
      return { manualId, step: step.n, status: "unsure", hint: (error as Error).message };
    }
  },
};

export const breadboardVerifiers = [hardwareVerifier];
