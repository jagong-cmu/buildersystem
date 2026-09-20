import { ScanView } from "@/ui/ScanView";
import { getManuals } from "@/lib/manuals.server";

export default async function ScanPage() {
  const manuals = await getManuals();
  const extraParts = Array.from(new Map(manuals.flatMap((manual) => (manual.extraParts ?? []).map((part) => [part.id, part] as const))).values());
  return <ScanView extraParts={extraParts} />;
}
