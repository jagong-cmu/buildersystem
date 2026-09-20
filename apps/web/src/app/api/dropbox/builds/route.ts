import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { getDropbox } from "@/lib/dropbox/client";
import { buildRecordPath, filesForBuild, makeBuildRecord, writeBuildRecord } from "@/lib/dropbox/builds";
import type { AppliedSub, Manual, VerifyResult } from "@/core/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const dbx = await getDropbox();
  if (!dbx) return NextResponse.json({ error: "Dropbox is not connected." }, { status: 401 });
  try {
    const body = (await request.json()) as {
      manualId?: string;
      manualSnapshot?: Manual;
      verify?: Record<number, VerifyResult>;
      subs?: AppliedSub[];
      startedAt?: number;
    };
    if (!body.manualId || !body.manualSnapshot || !body.verify || !body.subs || !body.startedAt) {
      return NextResponse.json({ error: "manualId, manualSnapshot, verify, subs, and startedAt are required." }, { status: 400 });
    }
    const pathName = buildRecordPath(body.manualSnapshot, new Date(), randomBytes(3).toString("hex"));
    const source = { path: pathName, manual: body.manualSnapshot, verify: body.verify, subs: body.subs, startedAt: body.startedAt };
    const record = makeBuildRecord(source, pathName);
    const files = await filesForBuild(source, record);
    const result = await writeBuildRecord(dbx, record, files);
    const qrSvg = result.url ? await QRCode.toString(result.url, { type: "svg" }) : undefined;
    return NextResponse.json({ ...result, qrSvg });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
