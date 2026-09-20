"use client";
// Draws the latest detections (bbox + label + qty) over a letterboxed live feed.
import { useEffect, useRef, useState } from "react";
import type { DomainId } from "@/core/types";
import type { Detection } from "@/lib/detections";
import { keyOf } from "@/lib/live-inventory";
import { bboxToRect, containRect } from "@/lib/overlay-geometry";
import { partLabel } from "@/lib/format";

export function FrameOverlay({
  domain,
  detections,
  frame,
  highlight,
  dimOthers,
  labels = "all",
}: {
  domain: DomainId;
  detections: Detection[];
  /** Pixel size of the source frame, needed to undo the letterboxing. */
  frame: { w: number; h: number } | null;
  /** Item keys (partType|color) to draw in the accent color. */
  highlight?: Set<string>;
  /** When highlighting, draw non-highlighted boxes faintly. */
  dimOthers?: boolean;
  /** Small overlays (PiP): only label the highlighted boxes. */
  labels?: "all" | "highlight";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const image = frame && box.w ? containRect(frame.w, frame.h, box.w, box.h) : null;

  return (
    <div ref={ref} className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {image &&
        detections
          .filter((d) => d.bbox || d.boxes?.length)
          .flatMap((d) => {
            const boxes = d.boxes?.length ? d.boxes : [d.bbox!];
            const hot = highlight?.has(keyOf(d)) || (highlight && d.color && highlight.has(`${d.partType}|`));
            const faded = dimOthers && highlight && !hot;
            const showLabel = labels !== "highlight" || hot;
            const color = hot ? "var(--accent)" : "var(--info)";
            const name = `${d.color ? `${d.color} ` : ""}${partLabel(domain, d.partType)}`;
            return boxes.map((bbox, i) => {
            const r = bboxToRect(bbox, image);
            return (
              <div
                key={`${keyOf(d)}#${i}`}
                className="absolute rounded-sm"
                style={{
                  left: r.x,
                  top: r.y,
                  width: r.w,
                  height: r.h,
                  border: `${hot ? 3 : 2}px solid ${color}`,
                  opacity: faded ? 0.35 : d.misses ? 0.6 : 1,
                  boxShadow: hot ? `0 0 0 2px color-mix(in srgb, ${color} 35%, transparent)` : undefined,
                  transition: "left .35s ease, top .35s ease, width .35s ease, height .35s ease, opacity .3s ease",
                }}
              >
                {showLabel && <span
                  className={`absolute left-0 ${i % 2 ? "-bottom-5" : "-top-5"} whitespace-nowrap px-1.5 py-0.5 rounded text-[11px] font-medium`}
                  style={{ background: color, color: "#111", maxWidth: `max(${Math.round(r.w)}px, 7rem)`, overflow: "hidden", textOverflow: "ellipsis" }}
                  title={name}
                >
                  {boxes.length > 1 ? `${name} · ${i + 1}/${boxes.length}` : `${d.qty} × ${name}`}
                </span>}
              </div>
            );
            });
          })}
    </div>
  );
}
