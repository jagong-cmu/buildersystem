import sharp from "sharp";

/** Mean absolute difference between two 32×32 greyscale thumbnails, 0..255. */
export async function thumbnail(jpeg: Uint8Array): Promise<Uint8Array> {
  const { data } = await sharp(Buffer.from(jpeg)).resize(32, 32, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  return new Uint8Array(data);
}

export function diffScore(a: Uint8Array, b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/**
 * Per-source motion state: emits 'active' when the score crosses the threshold
 * and 'settled' once it has stayed below it for `settleMs`.
 */
export class MotionDetector {
  private last?: Uint8Array;
  private state: "active" | "settled" = "settled";
  private quietSince = Date.now();
  constructor(
    private threshold = 6,
    private settleMs = 1500,
    private onChange: (state: "active" | "settled", score: number) => void = () => {},
  ) {}
  async feed(jpeg: Uint8Array): Promise<number> {
    let thumb: Uint8Array;
    try {
      thumb = await thumbnail(jpeg);
    } catch {
      return 0;
    }
    const score = this.last ? diffScore(this.last, thumb) : 0;
    this.last = thumb;
    const now = Date.now();
    if (score >= this.threshold) {
      this.quietSince = now;
      if (this.state !== "active") {
        this.state = "active";
        this.onChange("active", score);
      }
    } else if (this.state === "active" && now - this.quietSince >= this.settleMs) {
      this.state = "settled";
      this.onChange("settled", score);
    }
    return score;
  }
}
