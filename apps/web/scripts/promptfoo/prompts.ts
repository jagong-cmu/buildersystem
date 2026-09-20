// Prompt variants for the promptfoo vision eval. Each export receives the test vars and returns the
// full system prompt. `baseline` is exactly what production sends (src/core/inventory.ts); the other
// variants append hints. When a variant wins, fold it into inventoryPrompt and it becomes the baseline.
//
// History (gemini-3.5-flash-lite, 17 cases, mean F1 / exact-qty):
//   original prompt                     0.67 / 0.53  (x2 runs)
//   + colors, plate-height hint         0.73 / 0.59
//   + strict "fully visible only", side-wall plate rule, loose-thread hint   0.78-0.81 / 0.74  (x3 runs) -> folded in
import { getPlugin } from "../../src/domains";
import type { DomainId } from "../../src/core/types";
import { inventoryPrompt } from "../../src/core/inventory";

type PromptContext = { vars: { domain: DomainId } };

const withExtra = (ctx: PromptContext, extra: Partial<Record<DomainId, string>>) => {
  const base = inventoryPrompt(getPlugin(ctx.vars.domain));
  const add = extra[ctx.vars.domain];
  return add ? `${base}\n\n${add}` : base;
};

export const baseline = (ctx: PromptContext) => withExtra(ctx, {});

export const twoPass = (ctx: PromptContext) =>
  withExtra(ctx, {
    lego: "Work in two passes: first list each distinct (type, color) you can see clearly, then count instances of each one at a time, scanning left to right.",
    breadboard: "Work in two passes: first list each distinct component type, then count instances of each.",
  });

export const perColorPlates = (ctx: PromptContext) =>
  withExtra(ctx, {
    lego: "Report one item per (type, color) pair; pieces of the same type in different colors are separate items. Double-check the color of each piece individually rather than assuming they match.",
  });
