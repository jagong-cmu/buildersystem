import type { CSSProperties } from "react";

export function cropStyle(bbox: [number, number, number, number], box: { width: number; height: number }): CSSProperties {
  const [x, y, width, height] = bbox;
  const scaleX = 1 / Math.max(width, 0.0001);
  const scaleY = 1 / Math.max(height, 0.0001);
  return {
    width: "100%",
    height: "100%",
    transformOrigin: "top left",
    transform: `translate(${-x * box.width * scaleX}px, ${-y * box.height * scaleY}px) scale(${scaleX}, ${scaleY})`,
  };
}
