// Hub recorder: dumps frames from a live source to JPEGs so a real session can
// be replayed later with glasses-sim --dir <out> (this is also the stage backup).
//
//   pnpm --filter stream-hub record --source glasses --dir ./recordings/run1 [--seconds 60]
//
// Files are named <seq padded>-<ts>.jpg so a name sort replays in order; the
// control bus is tailed into control.jsonl alongside.
import { mkdir, appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import WebSocket from "ws";
import { decodeFrame } from "../src/protocol.js";

const args = process.argv.slice(2);
const opt = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};

const HUB = process.env.HUB ?? "ws://127.0.0.1:8787";
const SOURCE = opt("source", "glasses")!;
const DIR = opt("dir", `./recordings/${SOURCE}-${new Date().toISOString().replace(/[:.]/g, "-")}`)!;
const SECONDS = Number(opt("seconds", "0"));

async function main() {
  await mkdir(DIR, { recursive: true });
  const controlLog = path.join(DIR, "control.jsonl");
  await writeFile(controlLog, "");
  let frames = 0;
  let lastSeq = -1;

  const consume = new WebSocket(`${HUB}/consume?source=${encodeURIComponent(SOURCE)}`);
  consume.binaryType = "nodebuffer";
  consume.on("open", () => console.log(`recording ${SOURCE} → ${DIR}${SECONDS ? ` for ${SECONDS}s` : ""} (Ctrl-C to stop)`));
  consume.on("message", async (data, isBinary) => {
    if (!isBinary) return;
    let decoded;
    try {
      decoded = decodeFrame(new Uint8Array(data as Buffer));
    } catch {
      return;
    }
    if (decoded.header.seq === lastSeq) return;
    lastSeq = decoded.header.seq;
    frames++;
    const name = `${String(decoded.header.seq).padStart(6, "0")}-${decoded.header.ts}.jpg`;
    await writeFile(path.join(DIR, name), decoded.jpeg);
    if (frames % 25 === 0) console.log(`${frames} frames`);
  });
  consume.on("error", (e) => console.error("consume error:", e.message));

  const control = new WebSocket(`${HUB}/control`);
  control.on("message", (data) => {
    void appendFile(controlLog, JSON.stringify({ at: Date.now(), msg: JSON.parse(data.toString()) }) + "\n");
  });
  control.on("error", () => {});

  const stop = () => {
    console.log(`saved ${frames} frames to ${DIR}`);
    consume.close();
    control.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  if (SECONDS > 0) setTimeout(stop, SECONDS * 1000);
}

await main();
