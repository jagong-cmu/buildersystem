// Pure helpers for `pnpm demo:replay` (PRD §7.4): schedule a recorded glasses
// session (frames + control.jsonl from `record`) so it can be re-sent to the hub.

/** Messages a human/bridge produced; everything else on the bus is emitted by the app itself. */
export const OPERATOR_TYPES = new Set(["nav", "scan.start", "scan.stop", "check", "next", "prev", "part.missing", "where"]);

export interface ReplayControl {
  /** ms after the first recorded event */
  at: number;
  msg: Record<string, unknown>;
}

export interface ReplayFrame {
  name: string;
  /** ms after the first frame */
  at: number;
}

/** Parse `control.jsonl` and keep only operator messages, re-based to t=0. */
export function operatorMessages(jsonl: string, base?: number): ReplayControl[] {
  const rows: { at: number; msg: Record<string, unknown> }[] = [];
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let row: { at?: unknown; msg?: unknown };
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof row.at !== "number" || !row.msg || typeof row.msg !== "object") continue;
    const msg = row.msg as Record<string, unknown>;
    if (typeof msg.type !== "string" || !OPERATOR_TYPES.has(msg.type)) continue;
    if (msg.type === "check" && msg.origin === "guide") continue;
    rows.push({ at: row.at, msg });
  }
  rows.sort((a, b) => a.at - b.at);
  const t0 = base ?? rows[0]?.at ?? 0;
  return rows.map((r) => ({ at: Math.max(0, r.at - t0), msg: r.msg }));
}

/**
 * Frame files are named `<seq>-<ts>.jpg`; replay them at their recorded spacing.
 * Files without a timestamp fall back to a fixed `fallbackFps`.
 */
export function frameSchedule(names: string[], fallbackFps = 5): ReplayFrame[] {
  const files = names.filter((n) => /\.(jpe?g|png)$/i.test(n)).sort();
  const stamped = files.map((name) => {
    const m = /^\d+-(\d{10,})\./.exec(name);
    return { name, ts: m ? Number(m[1]) : NaN };
  });
  const allStamped = stamped.length > 0 && stamped.every((f) => Number.isFinite(f.ts));
  if (allStamped) {
    const t0 = stamped[0].ts;
    return stamped.map((f) => ({ name: f.name, at: f.ts - t0 }));
  }
  const gap = 1000 / fallbackFps;
  return stamped.map((f, i) => ({ name: f.name, at: Math.round(i * gap) }));
}

/** Timestamp of the first recorded frame, for aligning control events to frames. */
export function firstFrameTs(names: string[]): number | undefined {
  const sched = frameSchedule(names);
  const m = sched[0] && /^\d+-(\d{10,})\./.exec(sched[0].name);
  return m ? Number(m[1]) : undefined;
}
