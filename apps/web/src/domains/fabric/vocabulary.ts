import type { PartType } from "@/core/types";

export const FABRIC_PARTS: PartType[] = [
  cls("cotton_woven", "Cotton (woven)", "quilting-weight woven cotton, printed or solid, no stretch"),
  cls("canvas", "Canvas / duck", "heavy stiff woven cotton"),
  cls("denim", "Denim", "blue twill, heavy"),
  cls("fleece", "Fleece", "fuzzy synthetic, thick, stretchy"),
  cls("knit", "Jersey knit", "t-shirt fabric, stretchy"),
  notion("zipper", "Zipper", "nylon coil zipper with a pull tab"),
  notion("cord", "Drawstring cord", "round cord or ribbon, at least 1 m"),
  notion("elastic", "Elastic", "flat elastic band"),
  notion("thread", "Thread", "spool of sewing thread"),
  notion("button", "Button", "round button with holes"),
];

function cls(id: string, name: string, hint: string): PartType {
  return { id: `fab:${id}`, domain: "fabric", name, visionHint: `Fabric scrap, ${hint}`, props: { kind: "fabric" } };
}
function notion(id: string, name: string, hint: string): PartType {
  return { id: `fab:${id}`, domain: "fabric", name, visionHint: hint, props: { kind: "notion" } };
}

/** Which inventory fabric classes may stand in for a required class (no penalty). */
export const FABRIC_COMPAT: Record<string, string[]> = {
  "fab:cotton_woven": ["fab:cotton_woven", "fab:canvas", "fab:denim"],
  "fab:canvas": ["fab:canvas", "fab:denim"],
  "fab:denim": ["fab:denim", "fab:canvas"],
  "fab:fleece": ["fab:fleece"],
  "fab:knit": ["fab:knit"],
};

export function fabPartName(id: string): string {
  return FABRIC_PARTS.find((p) => p.id === id)?.name ?? id;
}
