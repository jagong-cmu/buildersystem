import { NextResponse } from "next/server";
import { getDropboxStatus } from "@/lib/dropbox/client";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getDropboxStatus());
}
