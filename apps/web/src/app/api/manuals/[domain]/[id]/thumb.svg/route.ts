import { NextResponse } from "next/server";
import { getPlugin } from "@/domains";
import { getManualById } from "@/lib/manuals.server";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ domain: string; id: string }> }) {
  const { domain, id } = await params;
  if (!["lego", "breadboard", "fabric"].includes(domain)) return new NextResponse("Not found", { status: 404 });
  const manual = await getManualById(id);
  if (!manual || manual.domain !== domain) return new NextResponse("Not found", { status: 404 });
  const render = getPlugin(manual.domain).thumbnailSvg;
  if (!render) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(render(manual as never), { headers: { "content-type": "image/svg+xml" } });
}
