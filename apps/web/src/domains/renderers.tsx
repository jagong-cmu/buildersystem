"use client";
// Renderer registry (UI side). Kept out of src/domains/index.ts so the Node index script never imports React/three.
import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { RendererProps } from "@/core/plugin";
import type { DomainId } from "@/core/types";
import type { PagePlacement } from "@/core/types";

const Loading = () => <div className="w-full h-full grid place-items-center muted text-sm">loading renderer…</div>;

export const RENDERERS: Record<DomainId, ComponentType<RendererProps<never>>> = {
  lego: dynamic(() => import("./lego/Renderer").then((m) => m.LegoRenderer), { ssr: false, loading: Loading }),
  breadboard: dynamic(() => import("./breadboard/Renderer").then((m) => m.BreadboardRenderer), { ssr: false, loading: Loading }),
  fabric: dynamic(() => import("./fabric/Renderer").then((m) => m.FabricRenderer), { ssr: false, loading: Loading }),
};

export const DOCUMENT_RENDERER: ComponentType<RendererProps<PagePlacement>> = dynamic(
  () => import("./document/Renderer").then((m) => m.DocumentRenderer),
  { ssr: false, loading: Loading },
);
