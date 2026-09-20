import type { DomainPlugin } from "@/core/plugin";
import type { BoardPlacement, Requirement } from "@/core/types";
import { loadBreadboardManual } from "./loader";
import { BREADBOARD_SUBS } from "./subs";
import { BREADBOARD_PARTS, bbPartName } from "./vocabulary";

export const breadboardPlugin: DomainPlugin<BoardPlacement> = {
  id: "breadboard",
  vocabulary: BREADBOARD_PARTS,
  loadManual: loadBreadboardManual,
  substitutions: BREADBOARD_SUBS,
  commerce(missing: Requirement[]) {
    return missing.map((m) => ({
      label: `Adafruit: ${bbPartName(m.partType)}`,
      url: `https://www.adafruit.com/search?q=${encodeURIComponent(bbPartName(m.partType))}`,
    }));
  },
};
