// Recorded demo mode (PRD §7.4): start the hub (unless one is already up), replay a
// recorded glasses session's frames as source "glasses", and re-send the operator
// control messages (nav / scan / check / next / prev / missing / where) with their
// original timing so the web app walks scan → builds → guide by itself.
//
//   pnpm demo:replay                       # recordings/demo, loop frames, run controls once
//   pnpm demo:replay -- --dir recordings/take1 --speed 2
//   pnpm demo:replay -- --check            # CI: exit 0 once frames + controls went through
//
// --dir <folder>   recording made by `record` (frames + control.jsonl); default recordings/demo
// --speed <x>      time multiplier for both frames and controls (default 1)
// --no-loop        stop frames when the folder ends (default: loop until controls finish + 3 s)
// --check          headless self-test: assert the hub saw the frames and controls, then exit
// --no-hub         don't spawn a hub, use HUB (default ws://127.0.0.1:8787)
import { spawn, type ChildProcess } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { encodeFrame } from "../src/protocol.js";
import { frameSchedule, firstFrameTs, operatorMessages } from "../src/replay.js";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..", "..", "..");
const HUB = process.env.HUB ?? "ws://127.0.0.1:8787";
const HUB_HTTP = HUB.replace(/^ws/, "http");
const DIR = path.resolve(ROOT, opt("dir", "recordings/demo")!);
const SPEED = Math.max(0.1, Number(opt("speed", "1")));
const LOOP = !flag("no-loop");
const CHECK = flag("check");
const SOURCE = opt("source", "glasses")!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function hubUp(): Promise<boolean> {
  try {
    const res = await fetch(`${HUB_HTTP}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureHub(): Promise<ChildProcess | null> {
  if (flag("no-hub") || (await hubUp())) return null;
  const port = new URL(HUB_HTTP).port || "8787";
  const child = spawn("npx", ["tsx", "src/index.ts"], { cwd: path.join(here, ".."), stdio: "inherit", env: { ...process.env, PORT: port } });
  for (let i = 0; i < 40 && !(await hubUp()); i++) await sleep(250);
  if (!(await hubUp())) throw new Error(`hub did not come up at ${HUB_HTTP}`);
  return child;
}

async function produce(names: string[], stop: () => boolean, onFrame: () => void) {
  const sched = frameSchedule(names);
  if (!sched.length) throw new Error(`no frames in ${DIR}`);
  const bufs = new Map<string, Buffer>();
  for (const f of sched) bufs.set(f.name, await readFile(path.join(DIR, f.name)));
  const dims = new Map<string, { w: number; h: number }>();
  const sharp = (await import("sharp")).default;
  for (const f of sched) {
    const m = await sharp(bufs.get(f.name)!).metadata();
    dims.set(f.name, { w: m.width ?? 960, h: m.height ?? 720 });
  }
  let ws: WebSocket | null = null;
  const open = async () => {
    for (;;) {
      try {
        const s = new WebSocket(`${HUB}/produce?source=${encodeURIComponent(SOURCE)}&kind=glasses`);
        await new Promise<void>((res, rej) => {
          s.once("open", () => res());
          s.once("error", rej);
        });
        return s;
      } catch {
        await sleep(1000);
      }
    }
  };
  ws = await open();
  let seq = 0;
  const span = sched[sched.length - 1].at + 1000 / 5;
  const started = Date.now();
  for (let loop = 0; !stop(); loop++) {
    for (const f of sched) {
      const due = started + (loop * span + f.at) / SPEED;
      const wait = due - Date.now();
      if (wait > 0) await sleep(wait);
      if (stop()) break;
      if (ws.readyState !== WebSocket.OPEN) ws = await open();
      const d = dims.get(f.name)!;
      seq++;
      ws.send(encodeFrame({ v: 1, sourceId: SOURCE, seq, ts: Date.now(), w: d.w, h: d.h, mime: "image/jpeg" }, bufs.get(f.name)!));
      onFrame();
    }
    if (!LOOP) break;
  }
  ws.close();
}

async function drive(controls: ReturnType<typeof operatorMessages>, onSent: () => void) {
  const started = Date.now();
  for (const c of controls) {
    const wait = started + c.at / SPEED - Date.now();
    if (wait > 0) await sleep(wait);
    await fetch(`${HUB_HTTP}/control`, { method: "POST", body: JSON.stringify(c.msg) }).catch(() => {});
    console.log(`control → ${JSON.stringify(c.msg)}`);
    onSent();
  }
}

async function main() {
  const names = await readdir(DIR);
  const jsonl = await readFile(path.join(DIR, "control.jsonl"), "utf8").catch(() => "");
  const controls = operatorMessages(jsonl, firstFrameTs(names));
  const hub = await ensureHub();
  console.log(`replaying ${DIR} → ${HUB} (${controls.length} operator messages, ${SPEED}x${LOOP ? ", looping frames" : ""})`);

  let frames = 0;
  let sent = 0;
  let controlsDone = false;
  let stop = false;
  const producer = produce(names, () => stop, () => frames++);
  await drive(controls, () => sent++);
  controlsDone = true;
  await sleep(CHECK ? 1000 : 3000);
  if (LOOP) stop = true;
  await producer;

  if (CHECK) {
    const res = await fetch(`${HUB_HTTP}/sources`);
    const sources = (await res.json()) as { id: string; frames: number }[];
    const src = sources.find((s) => s.id === SOURCE);
    const ok = !!src && src.frames > 0 && frames > 0 && sent === controls.length && controlsDone;
    console.log(ok ? `replay ok: ${frames} frames, ${sent}/${controls.length} controls, hub saw ${src?.frames}` : `replay FAILED: ${JSON.stringify({ frames, sent, src })}`);
    hub?.kill();
    process.exit(ok ? 0 : 1);
  }
  console.log(`replay done: ${frames} frames, ${sent} controls`);
  if (hub) {
    console.log("hub left running (Ctrl-C to stop)");
    await new Promise(() => {});
  }
}

await main();
