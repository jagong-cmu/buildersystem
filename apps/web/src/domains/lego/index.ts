import type { DomainPlugin } from "@/core/plugin";
import type { LegoPlacement, Requirement } from "@/core/types";
import { thumbnailSvg } from "./thumbnail";
import { loadLegoManual } from "./loader";
import { LEGO_SUBS } from "./subs";
import { LEGO_PARTS, COLOR_TO_LDRAW } from "./vocabulary";

export const legoPlugin: DomainPlugin<LegoPlacement> = {
  thumbnailSvg,
  id: "lego",
  vocabulary: LEGO_PARTS,
  loadManual: loadLegoManual,
  substitutions: LEGO_SUBS,
  commerce(missing: Requirement[]) {
    // BrickLink wanted-list XML is the community-standard "shop this list" format.
    const items = missing
      .map((m) => {
        const num = m.partType.replace("lego:", "");
        const color = m.color ? COLOR_TO_LDRAW[m.color] : undefined;
        return `<ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>${num}</ITEMID>${color !== undefined ? `<COLOR>${color}</COLOR>` : ""}<MINQTY>${m.qty}</MINQTY></ITEM>`;
      })
      .join("");
    const xml = `<INVENTORY>${items}</INVENTORY>`;
    return [
      { label: "BrickLink wanted list (XML)", url: `data:text/xml;charset=utf-8,${encodeURIComponent(xml)}` },
      ...missing.map((m) => ({
        label: `BrickLink: ${m.partType.replace("lego:", "")}`,
        url: `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${m.partType.replace("lego:", "")}`,
      })),
    ];
  },
};
