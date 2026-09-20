import { notFound } from "next/navigation";
import { MANUALS } from "@/lib/manuals";
import { getManualById } from "@/lib/manuals.server";
import { ScrollGuide } from "@/ui/ScrollGuide";
import { dropboxEnabled } from "@/lib/dropbox/client";

export function generateStaticParams() {
  return MANUALS.map((m) => ({ manualId: m.id }));
}

export const dynamicParams = true;

export default async function GuidePage({ params }: { params: Promise<{ manualId: string }> }) {
  const { manualId } = await params;
  const manual = await getManualById(manualId);
  if (!manual) notFound();
  return <ScrollGuide initial={manual} dropbox={dropboxEnabled()} />;
}
