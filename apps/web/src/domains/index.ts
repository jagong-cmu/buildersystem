import type { DomainPlugin } from "@/core/plugin";
import type { DomainId } from "@/core/types";
import { legoPlugin } from "./lego";
import { breadboardPlugin } from "./breadboard";
import { fabricPlugin } from "./fabric";

// The only place that enumerates domains. Everything else looks plugins up here.
export const PLUGINS: Record<DomainId, DomainPlugin> = {
  lego: legoPlugin as DomainPlugin,
  breadboard: breadboardPlugin as DomainPlugin,
  fabric: fabricPlugin as DomainPlugin,
};

export const DOMAIN_IDS = Object.keys(PLUGINS) as DomainId[];

export function getPlugin(id: DomainId): DomainPlugin {
  return PLUGINS[id];
}

/** Default match options per domain (PRD §21.5: LEGO is color-agnostic). */
export const MATCH_DEFAULTS: Record<DomainId, { colorAware: boolean }> = {
  lego: { colorAware: false },
  breadboard: { colorAware: false },
  fabric: { colorAware: false },
};
