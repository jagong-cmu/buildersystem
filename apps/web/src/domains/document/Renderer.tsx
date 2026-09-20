"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RendererProps } from "@/core/plugin";
import type { PagePlacement } from "@/core/types";
import { cropStyle } from "./crop";

export function DocumentRenderer({ manual, step, registerSnapshot }: RendererProps<PagePlacement>) {
  const [fullPage, setFullPage] = useState(false);
  const [box, setBox] = useState({ width: 640, height: 420 });
  const boxRef = useRef<HTMLDivElement>(null);
  const current = step > 0 ? manual.steps[step - 1] : undefined;
  const previous = step > 1 ? manual.steps[step - 2] : undefined;
  const region = current?.meta?.region as PagePlacement | undefined;
  const previousRegion = previous?.meta?.region as PagePlacement | undefined;
  const imageUrl = `/api/manuals/${manual.domain}/${manual.id}/page/${region?.page ?? 1}`;

  useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const resize = () => setBox({ width: element.clientWidth || 640, height: element.clientHeight || 420 });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const snapshot = useCallback(async () => {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 640;
    const context = canvas.getContext("2d");
    if (!context) return null;
    if (!region || fullPage) context.drawImage(image, 0, 0, canvas.width, canvas.height);
    else {
      const [x, y, width, height] = region.bbox;
      context.drawImage(image, x * image.naturalWidth, y * image.naturalHeight, width * image.naturalWidth, height * image.naturalHeight, 0, 0, canvas.width, canvas.height);
    }
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  }, [fullPage, imageUrl, region]);

  useEffect(() => registerSnapshot?.(snapshot), [registerSnapshot, snapshot]);

  const style = useMemo(() => (region && !fullPage ? cropStyle(region.bbox, box) : undefined), [box, fullPage, region]);
  return (
    <div className="relative h-full min-h-72 overflow-hidden rounded-lg border" style={{ borderColor: "var(--line)", background: "#0f1318" }}>
      <div ref={boxRef} className="absolute inset-0 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={`${manual.title} page ${region?.page ?? 1}`} className="absolute inset-0 object-fill" style={style} />
        {region && !fullPage && <div className="absolute border-2 border-cyan-300 pointer-events-none" style={{ left: `${region.bbox[0] * 100}%`, top: `${region.bbox[1] * 100}%`, width: `${region.bbox[2] * 100}%`, height: `${region.bbox[3] * 100}%` }} />}
        {previousRegion && !fullPage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/manuals/${manual.domain}/${manual.id}/page/${previousRegion.page}`} alt="" className="absolute bottom-3 left-3 w-28 h-20 object-cover opacity-45 border" style={{ objectPosition: `${(previousRegion.bbox[0] + previousRegion.bbox[2] / 2) * 100}% ${(previousRegion.bbox[1] + previousRegion.bbox[3] / 2) * 100}%` }} />
        )}
      </div>
      <button className="btn sm absolute top-3 right-3" type="button" onClick={() => setFullPage((value) => !value)}>
        {fullPage ? "crop" : "full page"}
      </button>
    </div>
  );
}
