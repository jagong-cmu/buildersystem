import sharp from "sharp";

export async function downscaleIfLarge(
  bytes: Uint8Array,
  opts: { maxPixels?: number } = {},
): Promise<{ data: Uint8Array; mediaType: string; scaled: boolean }> {
  const maxPixels = opts.maxPixels ?? 12_000_000;
  const image = sharp(bytes);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width * height <= maxPixels) {
    return { data: bytes, mediaType: `image/${metadata.format ?? "jpeg"}`, scaled: false };
  }
  const scale = Math.sqrt(maxPixels / (width * height));
  const data = await image
    .resize({ width: Math.floor(width * scale), height: Math.floor(height * scale), fit: "inside" })
    .toBuffer();
  return { data, mediaType: `image/${metadata.format ?? "jpeg"}`, scaled: true };
}
