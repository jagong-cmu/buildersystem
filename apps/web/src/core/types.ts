// Core types shared by every domain. See PRD.md §15.
// Nothing in this file may reference a specific domain's data.

export type DomainId = "lego" | "breadboard" | "fabric";

/** A kind of part the vision model can detect and manuals can require. */
export interface PartType {
  id: string; // 'lego:3001', 'bb:resistor_220', 'fab:cotton_woven'
  domain: DomainId;
  name: string;
  visionHint: string;
  refImages?: string[];
  props?: Record<string, string | number>;
}

/** A quantity of a part type, optionally in a specific color. */
export interface Requirement {
  partType: string;
  qty: number;
  color?: string;
}

export interface InventoryItem {
  partType: string;
  qty: number;
  color?: string;
  conf: number;
  bbox?: [number, number, number, number]; // normalized x,y,w,h of one representative instance
  boxes?: [number, number, number, number][]; // one normalized box per visible instance
  polygonMm?: [number, number][]; // fabric scraps only
  attrs?: Record<string, number | string>; // e.g. zipper lengthMm
}

export interface Inventory {
  domain: DomainId;
  items: InventoryItem[];
  capturedAt: string;
  sourceId: string;
  frameSeqs: number[];
}

export interface PartInstance<P = unknown> {
  id: string;
  partType: string;
  color?: string;
  placement: P;
}

export interface Probe {
  pin: string;
  mode: "analogRead" | "digitalRead" | "pulse";
  expect: { min?: number; max?: number; value?: 0 | 1 };
  note?: string;
}

export interface Expected {
  description: string;
  probes?: Probe[];
  imageUrl?: string;
}

export interface CameraHint {
  target: [number, number, number];
  azimuthDeg?: number;
  elevationDeg?: number;
}

export interface Step<P = unknown> {
  /** Phantom placement type so Step<P> stays aligned with Manual<P> / PartInstance<P>. */
  readonly __placement?: P;
  n: number; // 1-based
  title: string;
  text: string;
  add: string[]; // PartInstance ids introduced in this step
  callouts: Requirement[]; // parts the builder needs in hand for this step
  expected: Expected;
  camera?: CameraHint;
  /** Domain-specific step data the renderer needs (fabric: kind/pieces/seam). */
  meta?: Record<string, unknown>;
}

export interface ManualMeta {
  title: string;
  description: string;
  estMinutes: number;
  thumbnail?: string;
}

export interface Manual<P = unknown> extends ManualMeta {
  id: string;
  domain: DomainId;
  thumbnail: string;
  render?: "document";
  extraParts?: PartType[];
  needsReview?: boolean;
  source: { kind: "ldr" | "json"; path: string };
  requires: Requirement[]; // derived from parts, never hand-written
  parts: PartInstance<P>[]; // final state
  steps: Step<P>[];
}

export interface PagePlacement {
  kind: "page";
  page: number;
  bbox: [number, number, number, number];
}

export interface SubstitutionRule<P = unknown> {
  id: string;
  domain: DomainId;
  consumes: Requirement[];
  produces: Requirement;
  penalty: number;
  note: string;
  /** Optional: rewrite a placed instance into the substitute instances (used by replan).
   *  Method syntax on purpose: it keeps domain-typed rule arrays assignable to the generic matcher. */
  transform?(instance: PartInstance<P>): PartInstance<P>[];
}

export interface AppliedSub {
  ruleId: string;
  note: string;
  consumes: Requirement[];
  produces: Requirement;
  forStep?: number;
}

export type MatchStatus = "buildable" | "with-subs" | "missing";

export interface Match {
  manualId: string;
  status: MatchStatus;
  subs: AppliedSub[];
  missing: Requirement[];
  utilization: number; // 0..1 share of inventory quantity consumed
  penalty: number;
  feasibility?: { ok: boolean; detail: string };
}

export type VerifyStatus =
  | "pending"
  | "armed"
  | "checking"
  | "verified"
  | "mismatch"
  | "unsure";

export interface VerifyEvidence {
  [key: string]: unknown;
  evidenceId?: string;
  sourceId?: string;
  sourceKind?: string;
  before?: boolean;
  after?: boolean;
  expected?: boolean;
  armedAt?: number;
  verifiedAt?: number;
}

export interface VerifyResult {
  manualId: string;
  step: number;
  status: VerifyStatus;
  conf?: number;
  hint?: string;
  evidence?: VerifyEvidence;
}

// ---- Placement types (domain payloads carried in PartInstance.placement) ----

export interface LegoPlacement {
  ldrawPart: string; // '3001'
  ldrawColor: number; // LDraw color code
  /** LDraw transform: position (x,y,z) and 3x3 rotation, row-major a..i. LDU, -Y up. */
  pos: [number, number, number];
  rot: [number, number, number, number, number, number, number, number, number];
}

export interface Hole {
  row: string; // 'a'..'j' | 'vcc' | 'gnd'
  col: number; // 1..30
}
export interface BoardPin {
  board: string; // '5V' | 'GND' | 'A0' | 'D9' ...
}
export type BoardPlacement =
  | { kind: "part"; pins: Hole[]; polarity?: string[] }
  | { kind: "wire"; from: Hole | BoardPin; to: Hole | BoardPin };

export type FabricPlacement =
  | {
      kind: "piece";
      polygonMm: [number, number][];
      fabricClass: string;
      scrapId?: string;
      xMm?: number;
      yMm?: number;
      rotDeg?: number;
    }
  | { kind: "seam"; a: [string, string]; b: [string, string] }
  | { kind: "notion"; minLengthMm?: number };
