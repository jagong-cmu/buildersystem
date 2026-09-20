// promptfoo custom provider: runs the production vision path (src/lib/vision.ts + inventorySchema)
// with the rendered prompt as the system prompt. `config.model` picks the model ("<provider>/<name>").
import { readFile } from "node:fs/promises";
import { getPlugin } from "../../src/domains";
import type { DomainId } from "../../src/core/types";
import { inventorySchema } from "../../src/core/inventory";
import { visionObject } from "../../src/lib/vision";

type Vars = { domain: DomainId; images: string };
type ProviderOptions = { id?: string; config?: { model?: string; maxAttempts?: number } };
type CallContext = { vars: Vars };

const mediaTypeOf = (file: string) =>
  file.toLowerCase().endsWith(".png") ? "image/png" : file.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg";

export default class InventoryVisionProvider {
  private readonly providerId: string;
  private readonly model?: string;
  private readonly maxAttempts: number;

  constructor(options: ProviderOptions = {}) {
    this.model = options.config?.model;
    this.providerId = options.id ?? `inventory-vision:${this.model ?? "default"}`;
    this.maxAttempts = options.config?.maxAttempts ?? 6;
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt: string, context: CallContext) {
    const { domain } = context.vars;
    const files = JSON.parse(context.vars.images) as string[];
    const plugin = getPlugin(domain);
    const images = await Promise.all(files.map(async (f) => ({ data: new Uint8Array(await readFile(f)), mediaType: mediaTypeOf(f) })));
    const t0 = Date.now();
    let error = "";
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      try {
        const out = await visionObject({
          schema: inventorySchema(plugin),
          system: prompt,
          text: images.length > 1 ? `These ${images.length} photos show the same table from different angles. Report each part once.` : "Identify the parts on the table.",
          images,
          model: this.model,
        });
        return { output: JSON.stringify(out.items), latencyMs: Date.now() - t0 };
      } catch (e) {
        error = (e as Error).message;
        if (!/quota|429|rate|overloaded|503/i.test(error)) break;
        const m = /retry in ([\d.]+)s/i.exec(error);
        const waitMs = m ? Math.ceil(Number(m[1]) * 1000) + 1000 : 30_000 * (attempt + 1);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
    return { error, latencyMs: Date.now() - t0 };
  }
}
