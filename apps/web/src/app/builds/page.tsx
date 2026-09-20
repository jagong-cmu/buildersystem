import { BuildsView } from "@/ui/BuildsView";
import { getManuals } from "@/lib/manuals.server";

export default async function BuildsPage() {
  return <BuildsView manuals={await getManuals()} />;
}
