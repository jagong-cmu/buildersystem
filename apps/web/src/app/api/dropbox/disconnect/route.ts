import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { REFRESH_COOKIE } from "@/lib/dropbox/client";

export const runtime = "nodejs";

export async function POST() {
  (await cookies()).delete(REFRESH_COOKIE);
  return NextResponse.json({ ok: true });
}
