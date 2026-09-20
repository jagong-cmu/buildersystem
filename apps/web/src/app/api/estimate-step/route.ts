// State estimation on join (PRD §7.4): the current glasses frame vs renderer
// snapshots of steps 1..N → which step the physical build is at.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getManualById } from "@/lib/manuals.server";
import { VISION_MOCK, imageHash, visionObject } from "@/lib/vision";
import { mockEstimate, type StepEstimate } from "@/lib/hands-free";

export const runtime = "nodejs";

const HUB = (process.env.HUB_HTTP ?? (process.env.NEXT_PUBLIC_HUB_WS ?? "ws://localhost:8787").replace(/^ws/, "http")).replace(/\/$/, "");

const schema = z.object({
  step: z.number().int().describe("The step whose rendering best matches the physical build in the camera frame; 0 if no build is visible."),
  conf: z.number().min(0).max(1),
  reason: z.string().describe("One short sentence."),
});

async function latestFrame(sourceId?: string): Promise<Uint8Array | null> {
  try {
    const q = sourceId ? `?source=${encodeURIComponent(sourceId)}` : "";
    const res = await fetch(`${HUB}/frames/latest${q}`, { cache: "no-store" });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const form = await req.formData();
  const manualId = String(form.get("manualId") ?? "");
  const sourceId = String(form.get("sourceId") ?? "") || undefined;
  const manual = await getManualById(manualId);
  if (!manual) return NextResponse.json({ error: "unknown manual" }, { status: 404 });

  const snapshots: { step: number; data: Uint8Array }[] = [];
  for (const s of manual.steps) {
    const f = form.get(`step_${s.n}`);
    if (f instanceof File && f.type.startsWith("image/")) snapshots.push({ step: s.n, data: new Uint8Array(await f.arrayBuffer()) });
  }
  if (!snapshots.length) return NextResponse.json({ error: "no step snapshots" }, { status: 400 });

  const frame = await latestFrame(sourceId);
  if (!frame) return NextResponse.json({ step: 0, conf: 0, reason: "no live frame" } satisfies StepEstimate);

  if (VISION_MOCK) return NextResponse.json(mockEstimate(imageHash([{ data: frame }]), manual.steps.length));

  const images = [
    { data: frame, mediaType: "image/jpeg" },
    ...snapshots.map((s) => ({ data: s.data, mediaType: "image/png" })),
  ];
  const labels = snapshots.map((s, i) => `Image ${i + 2}: rendering of the build after step ${s.step} (${manual.steps[s.step - 1]?.text ?? ""}).`);
  try {
    const out = await visionObject({
      schema,
      system: "You compare a camera frame of a partly assembled physical build against renderings of the same build at successive steps. Pick the rendering whose set of placed parts matches what is physically assembled in the frame. Ignore loose parts lying around. If no assembled build is visible, answer step 0 with low confidence.",
      text: [`Domain: ${manual.domain}. Build: ${manual.title}. Image 1: the camera frame from the builder's glasses.`, ...labels, "Which step has the build reached?"].join("\n"),
      images,
    });
    const step = Math.max(0, Math.min(manual.steps.length, out.step));
    return NextResponse.json({ step, conf: out.conf, reason: out.reason } satisfies StepEstimate);
  } catch (e) {
    return NextResponse.json({ step: 0, conf: 0, reason: (e as Error).message } satisfies StepEstimate);
  }
}
