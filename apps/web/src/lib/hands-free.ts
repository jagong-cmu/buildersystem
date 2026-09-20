// Phase 3 hands-free helpers (PRD §7.4): state estimation on join and "Where is it".
import type { Detection } from "@/lib/detections";
import { detectionsFor } from "@/lib/detections";
import { locationPhrase } from "@/lib/live-inventory";
import type { Requirement } from "@/core/types";

export const OBJECTION_SECONDS = 5;
export const ESTIMATE_MIN_CONF = 0.5;

export interface StepEstimate {
  step: number;
  conf: number;
  reason?: string;
}

/**
 * Whether an estimate is worth proposing to the wearer: it must point past the
 * first step (otherwise the default is already right), be inside the manual and
 * be confident enough that interrupting is better than staying quiet.
 */
export function shouldPropose(est: StepEstimate | null | undefined, total: number, minConf = ESTIMATE_MIN_CONF): boolean {
  if (!est) return false;
  if (!Number.isFinite(est.step) || est.step < 2 || est.step > total) return false;
  return est.conf >= minConf;
}

export function proposalPhrase(step: number, seconds = OBJECTION_SECONDS): string {
  return `It looks like you're at step ${step}. Continue from there? Say back or press No within ${seconds} seconds.`;
}

/** Pick the estimate for VISION_MOCK: deterministic per frame, never step 1 so the flow is demoable. */
export function mockEstimate(seed: number, total: number): StepEstimate {
  if (total < 2) return { step: 1, conf: 0.9, reason: "mock" };
  return { step: 2 + (seed % (total - 1)), conf: 0.8, reason: "mock" };
}

/**
 * Five-second objection window: the proposal stands until it expires or the
 * wearer objects (button, "back", or any prev message). `tick()` returns
 * "accept" exactly once when the window runs out.
 */
export class ObjectionWindow {
  private objected = false;
  private settled = false;
  constructor(readonly step: number, readonly until: number) {}
  static open(step: number, now = Date.now(), seconds = OBJECTION_SECONDS): ObjectionWindow {
    return new ObjectionWindow(step, now + seconds * 1000);
  }
  secondsLeft(now = Date.now()): number {
    return Math.max(0, Math.ceil((this.until - now) / 1000));
  }
  object(): void {
    this.objected = true;
    this.settled = true;
  }
  tick(now = Date.now()): "accept" | "reject" | "pending" {
    if (this.settled) return this.objected ? "reject" : "pending";
    if (now < this.until) return "pending";
    this.settled = true;
    return "accept";
  }
}

/** Spoken answer to "where is it" for one requirement, from the latest detections. */
export function wherePhrase(label: string, detections: Detection[], req: Pick<Requirement, "partType" | "color">): string {
  const seen = detectionsFor(detections, req.partType, req.color).filter((d) => d.bbox && !d.misses);
  if (!seen.length) return `${label}: not in view. Look around the pile.`;
  const where = locationPhrase(seen[0].bbox!);
  return where === "center" ? `${label}: right in front of you.` : `${label}: ${where} of your view.`;
}

/** Match a spoken/typed part name against the step's callouts (bridge sends free text). */
export function matchCallout<R extends Requirement>(callouts: R[], labelOf: (r: R) => string, query?: string, color?: string): R[] {
  if (!query && !color) return callouts;
  const q = (query ?? "").toLowerCase().trim();
  return callouts.filter((c) => {
    if (color && (c.color ?? "").toLowerCase() !== color.toLowerCase()) return false;
    if (!q) return true;
    if (c.partType.toLowerCase() === q) return true;
    const label = labelOf(c).toLowerCase();
    return label.includes(q) || q.split(/\s+/).every((w) => label.includes(w));
  });
}
