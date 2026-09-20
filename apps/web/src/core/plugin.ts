import type { ComponentType } from "react";
import type {
  DomainId,
  Inventory,
  Manual,
  PartType,
  Requirement,
  Step,
  SubstitutionRule,
  VerifyResult,
} from "./types";

export interface RendererProps<P = unknown> {
  manual: Manual<P>;
  step: number; // 0 = nothing built, n = steps 1..n placed
  direction: "forward" | "back";
  /** Renderer calls this once with a function that captures the current view (used as the vision verifier's expected image). */
  registerSnapshot?: (fn: () => Promise<Blob | null>) => void;
}

export interface VerifyContext {
  before?: Blob;
  after?: Blob;
  expectedImage?: Blob;
  hubHttp: string;
}

export interface Verifier<P = unknown> {
  id: "vision" | "hardware";
  verify(manualId: string, step: Step<P>, ctx: VerifyContext): Promise<VerifyResult>;
}

export interface Feasibility {
  ok: boolean;
  detail: string;
  assignment?: unknown;
}

export interface CartLink {
  label: string;
  url: string;
}

/**
 * Everything domain-specific lives behind this interface (PRD §15).
 * `loadManual` receives the manual directory's files as strings so it can run
 * both in Node (index script) and in tests without touching the filesystem itself.
 */
export interface DomainPlugin<P = unknown> {
  id: DomainId;
  vocabulary: PartType[];
  loadManual(input: ManualInput): Manual<P>;
  substitutions: SubstitutionRule<P>[];
  feasibility?(inv: Inventory, m: Manual<P>): Feasibility;
  commerce?(missing: Requirement[]): CartLink[];
  /** Small final-state SVG for build cards (PRD §5.3); written to public/manuals/<domain>/<id>/thumb.svg by the index script. */
  thumbnailSvg?(manual: Manual<P>): string;
}

/** UI-side extension; kept separate so the index script never imports React. */
export interface DomainUI<P = unknown> {
  Renderer: ComponentType<RendererProps<P>>;
  verifiers: Verifier<P>[];
}

export interface ManualInput {
  id: string;
  dir: string; // repo-relative path, e.g. manuals/lego/phone_stand
  meta: { title: string; description: string; estMinutes: number; thumbnail?: string };
  files: Record<string, string>; // filename -> contents
}

export function vocabularyIds(plugin: DomainPlugin): string[] {
  return plugin.vocabulary.map((p) => p.id);
}

export function partTypeById(plugin: DomainPlugin, id: string): PartType | undefined {
  return plugin.vocabulary.find((p) => p.id === id);
}
