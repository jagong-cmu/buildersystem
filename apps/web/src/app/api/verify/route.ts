// Vision verifier (PRD §14.3): expected description + renderer snapshot + before/after frames → VerifyResult.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getManual } from "@/lib/manuals";
import { VISION_MOCK, imageHash, visionObject } from "@/lib/vision";
import { captureEvidence, type CaptureEvidenceResult } from "@/lib/evidence";
import type { VerifyResult } from "@/core/types";

export const runtime = "nodejs";

const resultSchema = z.object({
  status: z.enum(["verified", "mismatch", "unsure"]),
  conf: z.number().min(0).max(1),
  hint: z.string().describe("One short sentence for the builder: what is right, or what to fix."),
});

/** VISION_MOCK: verified two times out of three, mismatch otherwise, keyed on the frame bytes. */
function mockVerify(seed: number, step: number): z.infer<typeof resultSchema> {
  const roll = (seed + step) % 3;
  return roll === 2
    ? { status: "mismatch", conf: 0.8, hint: "The last part looks like it is one stud too far left." }
    : { status: "verified", conf: 0.9, hint: "Looks right." };
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "expected multipart form data" }, { status: 400 });
  const manualId = String(form.get("manualId") ?? "");
  const step = Number(form.get("step") ?? 0);
  const armedAt = Number(form.get("armedAt") ?? 0);
  const expectedFile = form.get("expected");
  const manual = getManual(manualId);
  const s = manual?.steps.find((x) => x.n === step);
  const fail = (hint: string, evidence?: CaptureEvidenceResult): VerifyResult => ({
    manualId,
    step,
    status: "unsure",
    hint,
    ...(evidence ? { evidence: evidenceWithoutFrames(evidence) } : {}),
  });
  if (!manual || !s) return NextResponse.json(fail("unknown manual or step"), { status: 404 });

  const sourceId = String(form.get("sourceId") ?? "") || undefined;
  const expectedData = expectedFile instanceof File && expectedFile.type.startsWith("image/png")
    ? new Uint8Array(await expectedFile.arrayBuffer())
    : undefined;
  const captured = await captureEvidence({ manualId, step, armedAt, sourceId, expected: expectedData });
  const { beforeFrame, afterFrame } = captured;
  if (!afterFrame) return NextResponse.json(fail("No live frames from the hub; mark the step done by hand.", captured));

  const images: { data: Uint8Array; mediaType: string }[] = [];
  const labels: string[] = [];
  if (expectedData) {
    images.push({ data: expectedData, mediaType: "image/png" });
    labels.push("Image 1: a rendering of what the build should look like after this step.");
  }
  if (beforeFrame) {
    images.push(beforeFrame);
    labels.push(`Image ${images.length}: the camera BEFORE the builder performed the step.`);
  }
  images.push(afterFrame);
  labels.push(`Image ${images.length}: the camera NOW.`);

  try {
    const out = VISION_MOCK
      ? mockVerify(imageHash([afterFrame]), step)
      : await visionObject({
          schema: resultSchema,
          system:
            "You verify one assembly step from camera images. Be conservative: say 'verified' only when the described change is clearly visible, 'mismatch' when something is clearly wrong or missing, otherwise 'unsure'. Never block the builder over lighting or angle.",
          text: [`Domain: ${manual.domain}. Build: ${manual.title}. Step ${step}: ${s.text}`, `Expected: ${s.expected.description}`, ...labels].join("\n"),
          images,
        });
    const result: VerifyResult = { manualId, step, status: out.status, conf: out.conf, hint: out.hint, evidence: evidenceWithoutFrames(captured) };
    const hub = (process.env.HUB_HTTP ?? (process.env.NEXT_PUBLIC_HUB_WS ?? "ws://localhost:8787").replace(/^ws/, "http")).replace(/\/$/, "");
    fetch(`${hub}/control`, { method: "POST", body: JSON.stringify({ type: "verify.result", manualId, step, status: out.status, hint: out.hint }) }).catch(() => {});
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(fail((e as Error).message, captured));
  }
}

function evidenceWithoutFrames(evidence: CaptureEvidenceResult) {
  return Object.fromEntries(Object.entries(evidence).filter(([key]) => key !== "beforeFrame" && key !== "afterFrame"));
}
