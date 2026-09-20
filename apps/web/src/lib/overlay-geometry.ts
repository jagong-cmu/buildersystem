// Map normalized detections onto an `object-contain` (letterboxed) image element.
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The rectangle an image of frameW×frameH occupies inside a boxW×boxH container with object-fit: contain. */
export function containRect(frameW: number, frameH: number, boxW: number, boxH: number): Rect {
  if (frameW <= 0 || frameH <= 0 || boxW <= 0 || boxH <= 0) return { x: 0, y: 0, w: boxW, h: boxH };
  const scale = Math.min(boxW / frameW, boxH / frameH);
  const w = frameW * scale;
  const h = frameH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

/** Normalized [x, y, w, h] (0..1, clamped) → pixels inside the displayed image rect. */
export function bboxToRect(bbox: [number, number, number, number], image: Rect): Rect {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const x0 = clamp(bbox[0]);
  const y0 = clamp(bbox[1]);
  const x1 = clamp(bbox[0] + bbox[2]);
  const y1 = clamp(bbox[1] + bbox[3]);
  return { x: image.x + x0 * image.w, y: image.y + y0 * image.h, w: (x1 - x0) * image.w, h: (y1 - y0) * image.h };
}
