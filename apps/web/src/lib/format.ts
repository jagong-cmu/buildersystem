import type { Requirement } from "@/core/types";
import { PLUGINS } from "@/domains";
import type { DomainId } from "@/core/types";

export function partLabel(domain: DomainId, partType: string): string {
  return PLUGINS[domain].vocabulary.find((p) => p.id === partType)?.name ?? partType;
}

export function reqLabel(domain: DomainId, r: Requirement): string {
  return `${r.qty} × ${r.color ? `${r.color} ` : ""}${partLabel(domain, r.partType)}`;
}

export const DOMAIN_LABEL: Record<DomainId, string> = { lego: "LEGO", breadboard: "Breadboard", fabric: "Fabric" };
