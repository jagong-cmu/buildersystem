// Thin typed wrapper around js-aruco2 (CommonJS, untyped). Works in the browser and in Node.
import jsAruco from "js-aruco2";
import { MAT, type Pt } from "./marker-mat";

export interface DetectedMarker {
  id: number;
  /** Pixel corners, clockwise from the marker's canonical top-left. */
  corners: Pt[];
  hammingDistance: number;
}

interface RawMarker {
  id: number;
  corners: { x: number; y: number }[];
  hammingDistance: number;
}
interface RawDetector {
  detect(image: { width: number; height: number; data: Uint8ClampedArray | Uint8Array }): RawMarker[];
}
interface RawDictionary {
  markSize: number;
  generateSVG(id: number): string;
}
interface ArucoModule {
  AR: {
    Detector: new (config?: { dictionaryName?: string; maxHammingDistance?: number }) => RawDetector;
    Dictionary: new (name: string) => RawDictionary;
  };
}

const { AR } = jsAruco as unknown as ArucoModule;

export function createDetector(): { detect(image: ImageData | { width: number; height: number; data: Uint8ClampedArray }): DetectedMarker[] } {
  const det = new AR.Detector({ dictionaryName: MAT.dictionary });
  return {
    detect(image) {
      return det.detect(image).map((m) => ({ id: m.id, corners: m.corners.map((c) => [c.x, c.y] as Pt), hammingDistance: m.hammingDistance }));
    },
  };
}

/** Marker SVG (with a 1-unit white quiet zone) and the black square's side in SVG units. */
export function markerSvg(id: number): { svg: string; size: number } {
  const dict = new AR.Dictionary(MAT.dictionary);
  return { svg: dict.generateSVG(id), size: dict.markSize };
}
