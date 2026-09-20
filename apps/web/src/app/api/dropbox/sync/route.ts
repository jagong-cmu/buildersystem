import { NextResponse } from "next/server";
import { getDropbox, rootPath } from "@/lib/dropbox/client";
import { sync } from "@/lib/dropbox/library";

export const runtime = "nodejs";

export async function POST() {
  const client = await getDropbox();
  if (!client) return NextResponse.json({ error: "Dropbox is not connected." }, { status: 503 });
  try {
    return NextResponse.json(await sync(client, { root: rootPath("/Manuals") }));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
