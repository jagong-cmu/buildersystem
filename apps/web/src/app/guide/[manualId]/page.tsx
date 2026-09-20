import { notFound } from "next/navigation";
import { getManual, MANUALS } from "@/lib/manuals";
import { ScrollGuide } from "@/ui/ScrollGuide";
import { dropboxEnabled } from "@/lib/dropbox/client";

export function generateStaticParams() {
  return MANUALS.map((m) => ({ manualId: m.id }));
}

export default async function GuidePage({ params }: { params: Promise<{ manualId: string }> }) {
  const { manualId } = await params;
  const manual = getManual(manualId);
  if (!manual) notFound();
  return <ScrollGuide initial={manual} dropbox={dropboxEnabled()} />;
}
