import { describe, expect, it } from "vitest";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { loadLibrary } from "../library";
import { getPlugin } from "@/domains";

describe("thumbnailSvg", () => {
  it("produces a non-empty, well-formed SVG for all 8 manuals", async () => {
    const { manuals, errors } = await loadLibrary();
    expect(errors).toEqual([]);
    expect(manuals.length).toBe(8);
    for (const m of manuals) {
      const thumb = getPlugin(m.domain).thumbnailSvg;
      expect(thumb, `${m.domain} has thumbnailSvg`).toBeDefined();
      const svg = thumb!(m);
      expect(svg.length, `${m.id} non-empty`).toBeGreaterThan(200);
      expect(svg.startsWith("<svg"), `${m.id} starts with <svg`).toBe(true);
      expect(XMLValidator.validate(svg), `${m.id} valid XML`).toBe(true);
      const doc = new XMLParser({ ignoreAttributes: false }).parse(svg);
      expect(doc.svg["@_xmlns"]).toBe("http://www.w3.org/2000/svg");
    }
  });
});
