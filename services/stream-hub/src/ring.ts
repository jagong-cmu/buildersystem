import type { FrameHeader } from "./protocol.js";

export interface StoredFrame {
  header: FrameHeader;
  jpeg: Uint8Array;
}

/** Fixed-capacity ring buffer of frames for one source. */
export class FrameRing {
  private buf: (StoredFrame | undefined)[];
  private head = 0;
  private count = 0;
  constructor(private capacity: number) {
    this.buf = new Array(capacity);
  }
  push(f: StoredFrame) {
    this.buf[this.head] = f;
    this.head = (this.head + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }
  latest(): StoredFrame | undefined {
    if (!this.count) return undefined;
    return this.buf[(this.head - 1 + this.capacity) % this.capacity];
  }
  all(): StoredFrame[] {
    const out: StoredFrame[] = [];
    for (let i = 0; i < this.count; i++) {
      const f = this.buf[(this.head - this.count + i + this.capacity) % this.capacity];
      if (f) out.push(f);
    }
    return out;
  }
  bySeq(seq: number): StoredFrame | undefined {
    return this.all().find((f) => f.header.seq === seq);
  }
  /** Frames with ts in [from, to]; `to` defaults to now. */
  range(from: number, to = Date.now()): StoredFrame[] {
    return this.all().filter((f) => f.header.ts >= from && f.header.ts <= to);
  }
  /** Closest frame at or before `ts`. */
  at(ts: number): StoredFrame | undefined {
    let best: StoredFrame | undefined;
    for (const f of this.all()) if (f.header.ts <= ts) best = f;
    return best;
  }
}
