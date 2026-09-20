import type { InventoryItem, Requirement } from "@/core/types";

/** One line of a LEGO set's parts list (from the box inventory page). */
export interface SetElement {
  element: string; // LEGO element id printed on the inventory page
  part: string; // part number used in manuals ('lego:<part>' -> partType)
  color: string; // color name from LDRAW_COLORS
  qty: number;
}

export interface LegoSet {
  id: string;
  name: string;
  pieces: number;
  elements: SetElement[];
}

const e = (element: string, part: string, color: string, qty: number): SetElement => ({ element, part, color, qty });

/** LEGO Classic 11039 Creative Food Friends — 150 pieces, transcribed from the set's inventory page. */
export const SET_11039: LegoSet = {
  id: "11039",
  name: "Creative Food Friends",
  pieces: 150,
  elements: [
    e("6284070", "98138", "black", 4),
    e("4125220", "3941", "tan", 2),
    e("6182261", "32607", "bright green", 6),
    e("6380676", "18674", "bright green", 2),
    e("6223427", "28626", "red", 2),
    e("6252037", "37352", "red", 2),
    e("6324417", "72399", "red", 1),
    e("6429055", "3262", "red", 1),
    e("6516544", "1748", "red", 2),
    e("300124", "3001", "yellow", 2),
    e("300824", "3008", "yellow", 1),
    e("6092583", "15573", "yellow", 2),
    e("6284577", "98138", "yellow", 2),
    e("6344217", "30565", "yellow", 4),
    e("4164022", "3004", "lime", 4),
    e("4165967", "3001", "lime", 2),
    e("4220632", "3003", "lime", 2),
    e("4234716", "3010", "lime", 2),
    e("4537919", "3009", "lime", 1),
    e("4537936", "3020", "lime", 2),
    e("4650630", "3039", "lime", 4),
    e("6030276", "3665", "lime", 4),
    e("6073026", "87087", "lime", 2),
    e("6312452", "49307", "lime", 2),
    e("6429057", "3262", "lime", 1),
    e("6432104", "102701", "lime", 1),
    e("6528558", "86876", "lime", 2),
    e("6284587", "98138", "bright pink", 2),
    e("6322819", "98138", "medium azure", 2),
    e("4211186", "3020", "reddish brown", 2),
    e("4211210", "3003", "reddish brown", 2),
    e("4529242", "59900", "reddish brown", 2),
    e("6035291", "85984", "reddish brown", 4),
    e("6371437", "49307", "reddish brown", 2),
    e("6425510", "3660", "reddish brown", 2),
    e("6440768", "67095", "reddish brown", 1),
    e("6514093", "35275", "trans clear", 2),
    e("6525777", "7134", "trans clear", 2),
    e("6514274", "37775", "trans orange", 2),
    e("6258572", "3004", "coral", 4),
    e("6261292", "87087", "coral", 4),
    e("6261293", "37352", "coral", 2),
    e("6422918", "3010", "coral", 2),
    e("6422920", "3003", "coral", 2),
    e("6522845", "110721", "coral", 1),
    e("6523861", "86876", "coral", 4),
    e("300401", "3004", "white", 2),
    e("301001", "3010", "white", 2),
    e("302001", "3020", "white", 4),
    e("4504369", "54200", "white", 2),
    e("4558952", "87087", "white", 4),
    e("6058177", "11211", "white", 2),
    e("6093053", "18674", "white", 2),
    e("6168642", "28626", "white", 2),
    e("6194851", "25214", "white", 1),
    e("6234807", "37762", "white", 2),
    e("6248827", "37352", "white", 2),
    e("6250591", "35399", "white", 2),
    e("6346616", "78666", "white", 2),
    e("6431715", "102576", "white", 2),
    e("6431716", "102577", "white", 2),
    e("6432105", "102702", "white", 2),
    e("6433501", "102763", "white", 2),
    e("6433502", "102764", "white", 2),
    e("6434345", "103032", "white", 2),
    e("6510068", "1748", "white", 2),
    e("6522847", "110723", "white", 1),
  ],
};

export const LEGO_SETS: LegoSet[] = [SET_11039];

export function setRequirements(set: LegoSet): Requirement[] {
  return set.elements.map((el) => ({ partType: `lego:${el.part}`, color: el.color, qty: el.qty }));
}

export function setInventoryItems(set: LegoSet): InventoryItem[] {
  return setRequirements(set).map((r) => ({ ...r, conf: 1 }));
}

/** How many of the set's pieces the inventory accounts for (each element capped at its set quantity). */
export function setCoverage(set: LegoSet, items: InventoryItem[], colorAware: boolean): number {
  const key = (part: string, color?: string) => (colorAware ? `${part}|${color ?? ""}` : part);
  const have = new Map<string, number>();
  for (const it of items) {
    const k = key(it.partType, it.color);
    have.set(k, (have.get(k) ?? 0) + it.qty);
  }
  let found = 0;
  for (const el of set.elements) {
    const k = key(`lego:${el.part}`, el.color);
    const n = Math.min(el.qty, have.get(k) ?? 0);
    found += n;
    have.set(k, (have.get(k) ?? 0) - n);
  }
  return found;
}
