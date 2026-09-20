// Glasses simulator (PRD §7.3): produces frames on the hub protocol as the
// "glasses" source from a folder of JPEGs, so every glasses-first screen is
// demoable with no hardware.
//
//   pnpm --filter stream-hub sim --dir ./photos --fps 5 --loop --pan --motion
//   pnpm --filter stream-hub sim --synthetic          # no photos: generated pile
//
// --dir <folder>     JPEG/PNG files, sorted by name (a recorder dump replays in order)
// --fps <n>          ≤ 10 (default 5)
// --loop             restart at the end of the folder
// --pan              crop-and-drift a window across large images so the view "moves"
// --motion           alternate motion active/settled control messages every --motion-period s
// --motion-period    seconds (default 12)
// --synthetic [n]    generate n colored-brick frames instead of reading a folder (default 24)
// --source <id>      default "glasses";  --kind <kind> default "glasses"
// HUB=ws://host:port (default ws://127.0.0.1:8787)
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import WebSocket from "ws";
import { encodeFrame, type ControlMessage } from "../src/protocol.js";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};

const HUB = process.env.HUB ?? "ws://127.0.0.1:8787";
const HUB_HTTP = HUB.replace(/^ws/, "http");
const SOURCE = opt("source", "glasses")!;
const KIND = opt("kind", "glasses")!;
const FPS = Math.min(10, Math.max(0.2, Number(opt("fps", "5"))));
const LOOP = flag("loop");
const PAN = flag("pan");
const MOTION = flag("motion");
const MOTION_PERIOD = Number(opt("motion-period", "12")) * 1000;
const SYNTHETIC = flag("synthetic") ? Number(opt("synthetic", "24")) : 0;
const DIR = opt("dir");
const OUT_W = 960;

interface Frame {
  jpeg: Buffer;
  w: number;
  h: number;
}

async function loadFolder(dir: string): Promise<{ name: string; buf: Buffer }[]> {
  const names = (await readdir(dir)).filter((n) => /\.(jpe?g|png)$/i.test(n)).sort();
  if (!names.length) throw new Error(`no JPEG/PNG files in ${dir}`);
  return Promise.all(names.map(async (name) => ({ name, buf: await readFile(path.join(dir, name)) })));
}

/** Pan windows: a slow Lissajous drift across the image, 60% of its size. */
async function panFrame(buf: Buffer, t: number): Promise<Frame> {
  const img = sharp(buf);
  const meta = await img.metadata();
  const W = meta.width ?? OUT_W;
  const H = meta.height ?? Math.round((OUT_W * 3) / 4);
  const cw = Math.max(32, Math.round(W * 0.6));
  const ch = Math.max(32, Math.round(H * 0.6));
  const x = Math.round(((Math.sin(t * 0.7) + 1) / 2) * (W - cw));
  const y = Math.round(((Math.cos(t * 0.45) + 1) / 2) * (H - ch));
  const out = await img
    .extract({ left: x, top: y, width: cw, height: ch })
    .resize({ width: Math.min(OUT_W, cw) })
    .jpeg({ quality: 70 })
    .toBuffer({ resolveWithObject: true });
  return { jpeg: out.data, w: out.info.width, h: out.info.height };
}

async function plainFrame(buf: Buffer): Promise<Frame> {
  const out = await sharp(buf).resize({ width: OUT_W, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer({ resolveWithObject: true });
  return { jpeg: out.data, w: out.info.width, h: out.info.height };
}

/** A synthetic "pile": colored rounded rectangles on a wooden table, drifting a little per frame. */
async function syntheticFrame(i: number): Promise<Frame> {
  const w = 960;
  const h = 720;
  const colors = ["#c8102e", "#0055bf", "#f2cd37", "#f4f4f4", "#237841", "#1b1b1b", "#a0a5a9"];
  const rects = Array.from({ length: 14 }, (_, k) => {
    const cx = ((k * 173) % 800) + 60 + Math.sin(i * 0.3 + k) * 25;
    const cy = ((k * 257) % 560) + 60 + Math.cos(i * 0.2 + k) * 20;
    const rw = 60 + (k % 4) * 30;
    const rh = 40 + (k % 3) * 15;
    return `<rect x="${cx}" y="${cy}" width="${rw}" height="${rh}" rx="6" fill="${colors[k % colors.length]}" stroke="#00000055"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#8b6b45"/>${rects}<text x="16" y="700" font-family="monospace" font-size="24" fill="#fff">glasses-sim synthetic frame ${i}</text></svg>`;
  const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 70 }).toBuffer();
  return { jpeg, w, h };
}

async function connect(): Promise<WebSocket> {
  for (;;) {
    try {
      const ws = new WebSocket(`${HUB}/produce?source=${encodeURIComponent(SOURCE)}&kind=${encodeURIComponent(KIND)}`);
      await new Promise<void>((resolve, reject) => {
        ws.once("open", () => resolve());
        ws.once("error", reject);
      });
      console.log(`producing as ${SOURCE} (${KIND}) → ${HUB} @ ${FPS} fps${PAN ? " pan" : ""}${LOOP ? " loop" : ""}${MOTION ? " motion" : ""}`);
      return ws;
    } catch {
      console.log(`hub not reachable at ${HUB}, retrying…`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

async function main() {
  if (!DIR && !SYNTHETIC) {
    console.error("usage: glasses-sim --dir <folder> [--fps n] [--loop] [--pan] [--motion] | --synthetic [n]");
    process.exit(2);
  }
  const files = DIR ? await loadFolder(DIR) : [];
  const total = DIR ? files.length : SYNTHETIC;
  let running = true;
  let ws = await connect();
  const reconnect = async () => {
    if (!running) return;
    ws = await connect();
    ws.on("close", reconnect);
  };
  ws.on("close", reconnect);

  let seq = 0;
  let motionTimer: ReturnType<typeof setInterval> | undefined;
  if (MOTION) {
    let state: "active" | "settled" = "settled";
    const emit = () => {
      state = state === "active" ? "settled" : "active";
      const msg: ControlMessage = { type: "motion", source: SOURCE, state, score: state === "active" ? 18 : 1 };
      fetch(`${HUB_HTTP}/control`, { method: "POST", body: JSON.stringify(msg) }).catch(() => {});
      console.log(`motion → ${state}`);
    };
    motionTimer = setInterval(emit, MOTION_PERIOD / 2);
  }

  const started = Date.now();
  for (let i = 0; LOOP || i < total; i++) {
    const idx = i % total;
    const t = (Date.now() - started) / 1000;
    let frame: Frame;
    try {
      frame = SYNTHETIC ? await syntheticFrame(i) : PAN ? await panFrame(files[idx].buf, t) : await plainFrame(files[idx].buf);
    } catch (e) {
      console.warn(`skip ${files[idx]?.name}: ${(e as Error).message}`);
      continue;
    }
    if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 2_000_000) {
      seq++;
      ws.send(encodeFrame({ v: 1, sourceId: SOURCE, seq, ts: Date.now(), w: frame.w, h: frame.h, mime: "image/jpeg" }, frame.jpeg));
      if (seq % 25 === 0) console.log(`sent ${seq} frames`);
    }
    await new Promise((r) => setTimeout(r, 1000 / FPS));
  }
  if (motionTimer) clearInterval(motionTimer);
  running = false;
  console.log(`done: ${seq} frames`);
  ws.close();
}

await main();
