import { promises as fs } from "node:fs";
import path from "node:path";
import mupdf from "mupdf";

const DEFAULT_DPI = 110;
const MAX_PAGES = 40;

export interface RasterizedPdf {
  pages: Uint8Array[];
  width: number;
  height: number;
}

export async function rasterizePdf(
  pdfBytes: Uint8Array,
  opts: { dpi?: number; maxPages?: number } = {},
): Promise<RasterizedPdf> {
  const dpi = opts.dpi ?? DEFAULT_DPI;
  const maxPages = opts.maxPages ?? MAX_PAGES;
  const doc = mupdf.Document.openDocument(pdfBytes, "application/pdf");
  const count = doc.countPages();
  if (count > maxPages) throw new Error(`PDF has ${count} pages; the limit is ${maxPages}`);
  const scale = dpi / 72;
  const pages: Uint8Array[] = [];
  let width = 0;
  let height = 0;
  for (let i = 0; i < count; i++) {
    const page = doc.loadPage(i);
    const bounds = page.getBounds();
    width = Math.max(width, Math.round((bounds[2] - bounds[0]) * scale));
    height = Math.max(height, Math.round((bounds[3] - bounds[1]) * scale));
    pages.push(page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false).asPNG());
  }
  return { pages, width, height };
}

export function pageCacheDir(domain: string, id: string) {
  return path.join(process.cwd(), ".cache", "dropbox", "pages", domain, id);
}

export async function getPageImage(domain: string, id: string, n: number): Promise<Uint8Array> {
  const dir = pageCacheDir(domain, id);
  const cached = path.join(dir, `page-${n}.png`);
  try {
    return new Uint8Array(await fs.readFile(cached));
  } catch {
    const source = path.join(process.cwd(), ".cache", "dropbox", "manuals", domain, id, "source.pdf");
    const rasterized = await rasterizePdf(new Uint8Array(await fs.readFile(source)));
    if (n < 1 || n > rasterized.pages.length) throw new Error(`Page ${n} is unavailable`);
    await fs.mkdir(dir, { recursive: true });
    await Promise.all(
      rasterized.pages.map((page, index) => fs.writeFile(path.join(dir, `page-${index + 1}.png`), page)),
    );
    await fs.writeFile(
      path.join(dir, "pages.json"),
      JSON.stringify({ count: rasterized.pages.length, width: rasterized.width, height: rasterized.height }),
    );
    return rasterized.pages[n - 1];
  }
}
