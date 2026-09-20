// Prompt variants for the promptfoo vision eval. Each export receives the test vars and returns the
// full system prompt. `baseline` is exactly what production sends (src/core/inventory.ts); the other
// variants append hints. When a variant wins, fold it into inventoryPrompt and it becomes the baseline.
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

export const colorsAndPlates = (ctx: PromptContext) =>
  withExtra(ctx, {
    lego: [
      "Also allowed colors: lime, dark green, dark blue, medium blue, dark red, brown, pink, purple, sand green. Use the closest listed name; never invent compound names.",
      "Plates are one third the height of a brick (a 2x4 plate is flat and thin; a 2x4 brick is tall). Decide brick vs plate from height before counting studs.",
    ].join("\n"),
  });

export const countCarefully = (ctx: PromptContext) =>
  withExtra(ctx, {
    lego: [
      "Also allowed colors: lime, dark green, dark blue, medium blue, dark red, brown, pink, purple, sand green.",
      "Plates are one third the height of a brick. Decide brick vs plate from height before counting studs.",
      "Count in two passes: first list each distinct (type, color) you see, then count instances of each one at a time, scanning left to right. Count studs along both edges to determine size (e.g. 2 studs by 4 studs = 2x4). Only count pieces whose stud layout you can actually see.",
    ].join("\n"),
    breadboard: [
      "Count in two passes: first list each distinct component type, then count instances of each. Do not count a component that is mounted on a board as a separate loose part unless it clearly is one.",
    ].join("\n"),
    fabric: [
      "Also report spools of thread, zippers, buttons and other notions in the vocabulary even when no fabric scrap is present.",
    ].join("\n"),
  });
