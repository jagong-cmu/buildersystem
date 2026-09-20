import { NextResponse } from "next/server";
import { captureEvidence } from "@/lib/evidence";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { manualId?: string; step?: number; armedAt?: number; sourceId?: string };
    if (!body.manualId || !body.step) return NextResponse.json({ error: "manualId and step are required" }, { status: 400 });
    const evidence = await captureEvidence({
      manualId: body.manualId,
      step: Number(body.step),
      armedAt: body.armedAt,
      sourceId: body.sourceId,
    });
    const metadata = Object.fromEntries(Object.entries(evidence).filter(([key]) => key !== "beforeFrame" && key !== "afterFrame"));
    return NextResponse.json({ evidence: metadata });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
