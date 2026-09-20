import { NextResponse } from "next/server";
import { getManualById } from "@/lib/manuals.server";
import { compareProbes, type ProbeReading } from "@/domains/breadboard/verifiers";
import type { VerifyResult } from "@/core/types";

export const runtime = "nodejs";

const HUB = (process.env.HUB_HTTP ?? (process.env.NEXT_PUBLIC_HUB_WS ?? "ws://localhost:8787").replace(/^ws/, "http")).replace(/\/$/, "");
const PROBE_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 8000);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(req: Request) {
  let body: { manualId?: string; step?: number };
  try {
    body = (await req.json()) as { manualId?: string; step?: number };
  } catch {
    return NextResponse.json({ status: "unsure", hint: "Invalid probe request." }, { status: 400 });
  }

  const manualId = String(body.manualId ?? "");
  const step = Number(body.step ?? 0);
  const manual = await getManualById(manualId);
  const s = manual?.steps.find((candidate) => candidate.n === step);
  const fail = (hint: string): VerifyResult => ({ manualId, step, status: "unsure", hint });
  if (!manual || !s) return NextResponse.json(fail("unknown manual or step"), { status: 404 });
  const probes = s.expected.probes;
  if (!probes?.length) return NextResponse.json(fail("This step has no hardware probes."), { status: 400 });

  let jobId: string;
  try {
    const jobResponse = await fetch(`${HUB}/probe/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ board: process.env.BOARD_ID ?? "uno_q", probes }),
      cache: "no-store",
    });
    if (!jobResponse.ok) throw new Error(`hub returned ${jobResponse.status}`);
    ({ id: jobId } = (await jobResponse.json()) as { id: string });
  } catch {
    return NextResponse.json(fail("Stream hub is offline; mark the step done by hand."));
  }

  const deadline = Date.now() + PROBE_TIMEOUT_MS;
  try {
    while (Date.now() < deadline) {
      const response = await fetch(`${HUB}/probe/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`hub returned ${response.status}`);
      const job = (await response.json()) as { result?: unknown };
      if (job.result !== undefined) {
        const readings = job.result as ProbeReading[];
        const comparison = compareProbes(probes, readings);
        const result: VerifyResult = {
          manualId,
          step,
          status: comparison.status,
          conf: comparison.status === "verified" ? 0.95 : 0.9,
          hint: comparison.hint,
          evidence: { jobId, readings, comparisons: comparison.comparisons },
        };
        fetch(`${HUB}/control`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "verify.result", manualId, step, status: result.status, hint: result.hint, source: "hardware" }),
        }).catch(() => {});
        return NextResponse.json(result);
      }
      await sleep(Math.min(250, Math.max(0, deadline - Date.now())));
    }
  } catch {
    return NextResponse.json(fail("Stream hub is offline; mark the step done by hand."));
  }

  return NextResponse.json({
    ...fail(`No answer from the board in ${Math.round(PROBE_TIMEOUT_MS / 1000)} s — is the UNO Q agent running?`),
    evidence: { jobId },
  });
}
