// Hands-free verification state machine (PRD §14.3): after the hub reports
// motion.active followed by motion.settled for the primary source while a step is
// armed, run the verifier — debounced to once per `minIntervalMs` per step, never
// while a manual Check is in flight, and only while enabled.
export type MotionState = "active" | "settled";

export interface AutoVerifyOptions {
  minIntervalMs?: number;
  enabled?: boolean;
}

export class AutoVerify {
  readonly minIntervalMs: number;
  enabled: boolean;
  private step: number | null = null;
  private sawActive = false;
  private lastRun = new Map<number, number>();
  private _checking = false;

  constructor(opts: AutoVerifyOptions = {}) {
    this.minIntervalMs = opts.minIntervalMs ?? 10_000;
    this.enabled = opts.enabled ?? true;
  }

  /** A step became active (armed); motion seen before this does not count. */
  setStep(step: number | null) {
    if (step !== this.step) this.sawActive = false;
    this.step = step;
  }

  /** Track manual / automatic checks so two never overlap. */
  setChecking(v: boolean) {
    this._checking = v;
  }

  get checking() {
    return this._checking;
  }

  get currentStep() {
    return this.step;
  }

  /** Returns the step to verify now, or null. */
  onMotion(state: MotionState, now = Date.now()): number | null {
    if (state === "active") {
      this.sawActive = true;
      return null;
    }
    if (!this.sawActive) return null;
    this.sawActive = false;
    if (!this.enabled || this._checking || this.step == null || this.step <= 0) return null;
    const last = this.lastRun.get(this.step);
    if (last != null && now - last < this.minIntervalMs) return null;
    this.lastRun.set(this.step, now);
    return this.step;
  }
}
