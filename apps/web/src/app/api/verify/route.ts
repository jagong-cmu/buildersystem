// Vision verifier (PRD §14.3): expected description + renderer snapshot + before/after frames → VerifyResult.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getManual } from "@/lib/manuals";
import { visionObject } from "@/lib/vision";
import type { VerifyResult } from "@/core/types";

export const runtime = "nodejs";

const HUB = (process.env.HUB_HTTP ?? (process.env.NEXT_PUBLIC_HUB_WS ?? "ws://localhost:8787").replace(/^ws/, "http")).replace(/\/$/, "");

const resultSchema = z.object({
  status: z.enum(["verified", "mismatch", "unsure"]),
  conf: z.number().min(0).max(1),
  hint: z.string().describe("One short sentence for the builder: what is right, or what to fix."),
});

async function hubFrame(path: string): Promise<{ data: Uint8Array; mediaType: string } | null> {
  try {
    const res = await fetch(`${HUB}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return { data: new Uint8Array(await res.arrayBuffer()), mediaType: "image/jpeg" };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const form = await req.formData();
  const manualId = String(form.get("manualId") ?? "");
  const step = Number(form.get("step") ?? 0);
  const armedAt = Number(form.get("armedAt") ?? 0);
  const expectedFile = form.get("expected");
  const manual = getManual(manualId);
  const s = manual?.steps.find((x) => x.n === step);
  const fail = (hint: string): VerifyResult => ({ manualId, step, status: "unsure", hint });
  if (!manual || !s) return NextResponse.json(fail("unknown manual or step"), { status: 404 });

  let sourceId = String(form.get("sourceId") ?? "");
  if (!sourceId) {
    try {
      const sources = (await (await fetch(`${HUB}/sources`, { cache: "no-store" })).json()) as { id: string; online: boolean }[];
      sourceId = sources.find((x) => x.online)?.id ?? sources[0]?.id ?? "";
    } catch {
      return NextResponse.json(fail("Stream hub is offline; mark the step done by hand."));
    }
  }
  const after = sourceId ? await hubFrame(`/frames/latest?source=${encodeURIComponent(sourceId)}`) : null;
  if (!after) return NextResponse.json(fail("No live frames from the hub; mark the step done by hand."));
  const before = armedAt ? await hubFrame(`/frames/at?source=${encodeURIComponent(sourceId)}&ts=${armedAt}`) : null;

  const images: { data: Uint8Array; mediaType: string }[] = [];
  const labels: string[] = [];
  if (expectedFile instanceof File && expectedFile.type.startsWith("image/png")) {
    images.push({ data: new Uint8Array(await expectedFile.arrayBuffer()), mediaType: "image/png" });
    labels.push("Image 1: a rendering of what the build should look like after this step.");
  }
  if (before) {
    images.push(before);
    labels.push(`Image ${images.length}: the camera BEFORE the builder performed the step.`);
  }
  images.push(after);
  labels.push(`Image ${images.length}: the camera NOW.`);

  try {
    const out = await visionObject({
      schema: resultSchema,
      system:
        "You verify one assembly step from camera images. Be conservative: say 'verified' only when the described change is clearly visible, 'mismatch' when something is clearly wrong or missing, otherwise 'unsure'. Never block the builder over lighting or angle.",
      text: [`Domain: ${manual.domain}. Build: ${manual.title}. Step ${step}: ${s.text}`, `Expected: ${s.expected.description}`, ...labels].join("\n"),
      images,
    });
    const result: VerifyResult = { manualId, step, status: out.status, conf: out.conf, hint: out.hint, evidence: { sourceId, before: !!before } };
    fetch(`${HUB}/control`, { method: "POST", body: JSON.stringify({ type: "verify.result", manualId, step, status: out.status, hint: out.hint }) }).catch(() => {});
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(fail((e as Error).message));
  }
}
