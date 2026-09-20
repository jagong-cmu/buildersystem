import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { downscaleIfLarge } from "../images";

describe("downscaleIfLarge", () => {
  it("scales images over the pixel cap", async () => {
    const input = await sharp({ create: { width: 4000, height: 4000, channels: 3, background: "red" } }).png().toBuffer();
    const output = await downscaleIfLarge(input);
    const metadata = await sharp(output.data).metadata();
    expect(output.scaled).toBe(true);
    expect((metadata.width ?? 0) * (metadata.height ?? 0)).toBeLessThanOrEqual(12_000_000);
  });

  it("returns small images untouched", async () => {
    const input = await sharp({ create: { width: 100, height: 100, channels: 3, background: "blue" } }).png().toBuffer();
    const output = await downscaleIfLarge(input);
    expect(output.scaled).toBe(false);
    expect(output.data).toEqual(input);
  });
});
