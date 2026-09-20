import { describe, expect, it } from "vitest";
import { normalizeBrickColor, toVocabPart } from "../brickognize";

const vocab = new Set(["lego:3001", "lego:3004", "lego:3794"]);

describe("toVocabPart", () => {
  it("maps exact BrickLink ids", () => {
    expect(toVocabPart("3001", vocab)).toBe("lego:3001");
  });
  it("falls back to the numeric stem for mould and print variants", () => {
    expect(toVocabPart("3001special", vocab)).toBe("lego:3001");
    expect(toVocabPart("3794b", vocab)).toBe("lego:3794");
    expect(toVocabPart("3004pb123", vocab)).toBe("lego:3004");
  });
  it("rejects parts outside the vocabulary", () => {
    expect(toVocabPart("2456", vocab)).toBeUndefined();
    expect(toVocabPart("x123", vocab)).toBeUndefined();
  });
});

describe("normalizeBrickColor", () => {
  it("lowercases and maps BrickLink names onto the app palette", () => {
    expect(normalizeBrickColor("Red")).toBe("red");
    expect(normalizeBrickColor("Light Bluish Gray")).toBe("light gray");
    expect(normalizeBrickColor("Dark Bluish Gray")).toBe("dark gray");
    expect(normalizeBrickColor("Trans-Clear")).toBe("trans clear");
    expect(normalizeBrickColor("Bright Pink")).toBe("bright pink");
  });
});
