// Stream hub (PRD §8): many producers (glasses bridge, phone PWA, UNO Q webcam)
// → per-source ring buffer → many consumers (web UI, verification worker),
// plus a JSON control bus and the UNO Q probe job queue.
import http from "node:http";
import { URL } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { decodeFrame, encodeFrame, type ControlMessage } from "./protocol.js";
import { FrameRing } from "./ring.js";
import { MotionDetector } from "./motion.js";

const PORT = Number(process.env.PORT ?? 8787);
const RING_SECONDS = Number(process.env.RING_SECONDS ?? 30);
const RING_FPS = Number(process.env.RING_FPS ?? 10);

interface Source {
  id: string;
  kind: string;
  ring: FrameRing;
  motion: MotionDetector;
  consumers: Set<WebSocket>;
  producer?: WebSocket;
  frames: number;
  windowStart: number;
  fps: number;
}

interface ProbeJob {
  id: string;
  board: string;
  probes: unknown[];
  createdAt: number;
  result?: unknown;
}

const sources = new Map<string, Source>();
const control = new Set<WebSocket>();
const jobs = new Map<string, ProbeJob>();

function source(id: string, kind = "unknown"): Source {
  let s = sources.get(id);
  if (!s) {
    const created: Source = {
      id,
      kind,
      ring: new FrameRing(RING_SECONDS * RING_FPS),
      consumers: new Set(),
      frames: 0,
      windowStart: Date.now(),
      fps: 0,
      motion: new MotionDetector(6, 1500, (state, score) => broadcast({ type: "motion", source: id, state, score })),
    };
    s = created;
    sources.set(id, s);
  }
  if (kind !== "unknown") s.kind = kind;
  return s;
}

function broadcast(msg: ControlMessage) {
  const data = JSON.stringify(msg);
  for (const ws of control) if (ws.readyState === WebSocket.OPEN) ws.send(data);
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const sid = url.searchParams.get("source") ?? "";
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    return res.end();
  }
  try {
    if (url.pathname === "/health") return json(res, 200, { ok: true, sources: sources.size });

    if (url.pathname === "/sources") {
      return json(
        res,
        200,
        [...sources.values()].map((s) => ({
          id: s.id,
          kind: s.kind,
          online: !!s.producer && s.producer.readyState === WebSocket.OPEN,
          fps: s.fps,
          frames: s.ring.all().length,
          latestSeq: s.ring.latest()?.header.seq ?? null,
          latestTs: s.ring.latest()?.header.ts ?? null,
        })),
      );
    }

    if (url.pathname === "/frames/latest") {
      const f = sources.get(sid)?.ring.latest();
      if (!f) return json(res, 404, { error: "no frames" });
      res.writeHead(200, { "content-type": "image/jpeg", "access-control-allow-origin": "*", "access-control-expose-headers": "x-seq, x-ts", "x-seq": String(f.header.seq), "x-ts": String(f.header.ts), "cache-control": "no-store" });
      return res.end(Buffer.from(f.jpeg));
    }

    if (url.pathname === "/frames/at") {
      const ts = Number(url.searchParams.get("ts"));
      const f = sources.get(sid)?.ring.at(ts);
      if (!f) return json(res, 404, { error: "no frame at ts" });
      res.writeHead(200, { "content-type": "image/jpeg", "access-control-allow-origin": "*", "access-control-expose-headers": "x-seq, x-ts", "x-seq": String(f.header.seq), "x-ts": String(f.header.ts) });
      return res.end(Buffer.from(f.jpeg));
    }

    if (url.pathname === "/frames/range") {
      const from = Number(url.searchParams.get("from") ?? 0);
      const to = Number(url.searchParams.get("to") ?? Date.now());
      const list = sources.get(sid)?.ring.range(from, to) ?? [];
      return json(res, 200, list.map((f) => ({ seq: f.header.seq, ts: f.header.ts, w: f.header.w, h: f.header.h })));
    }

    const bySeq = url.pathname.match(/^\/frames\/(\d+)$/);
    if (bySeq) {
      const f = sources.get(sid)?.ring.bySeq(Number(bySeq[1]));
      if (!f) return json(res, 404, { error: "no such frame" });
      res.writeHead(200, { "content-type": "image/jpeg", "access-control-allow-origin": "*" });
      return res.end(Buffer.from(f.jpeg));
    }

    // --- UNO Q probe queue (PRD §14.2) ---
    if (url.pathname === "/probe/jobs" && req.method === "POST") {
      const body = JSON.parse(await readBody(req)) as { board: string; probes: unknown[] };
      const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      jobs.set(id, { id, board: body.board, probes: body.probes, createdAt: Date.now() });
      return json(res, 201, { id });
    }
    if (url.pathname === "/probe/jobs" && req.method === "GET") {
      const board = url.searchParams.get("board");
      const pending = [...jobs.values()].filter((j) => !j.result && (!board || j.board === board));
      return json(res, 200, pending);
    }
    const jobGet = url.pathname.match(/^\/probe\/jobs\/([^/]+)$/);
    if (jobGet && req.method === "GET") {
      const j = jobs.get(jobGet[1]);
      return j ? json(res, 200, j) : json(res, 404, { error: "no such job" });
    }
    if (url.pathname === "/probe/results" && req.method === "POST") {
      const body = JSON.parse(await readBody(req)) as { jobId: string; results: unknown };
      const j = jobs.get(body.jobId);
      if (!j) return json(res, 404, { error: "no such job" });
      j.result = body.results;
      return json(res, 200, { ok: true });
    }

    // Control bus over HTTP for sources that can't hold a socket (curl, UNO Q scripts).
    if (url.pathname === "/control" && req.method === "POST") {
      broadcast(JSON.parse(await readBody(req)) as ControlMessage);
      return json(res, 200, { ok: true });
    }

    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 500, { error: (e as Error).message });
  }
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  wss.handleUpgrade(req, socket, head, (ws) => {
    const sid = url.searchParams.get("source") ?? "default";
    if (url.pathname === "/produce") {
      const s = source(sid, url.searchParams.get("kind") ?? "unknown");
      s.producer = ws;
      broadcast({ type: "source.status", source: s.id, kind: s.kind, online: true, fps: 0 });
      ws.on("message", (data, isBinary) => {
        if (!isBinary) return;
        const buf = new Uint8Array(data as Buffer);
        let decoded;
        try {
          decoded = decodeFrame(buf);
        } catch {
          return;
        }
        s.ring.push(decoded);
        s.frames++;
        const now = Date.now();
        if (now - s.windowStart >= 1000) {
          s.fps = s.frames / ((now - s.windowStart) / 1000);
          s.frames = 0;
          s.windowStart = now;
          broadcast({ type: "source.status", source: s.id, kind: s.kind, online: true, fps: Math.round(s.fps * 10) / 10 });
        }
        // Fan out (latest wins: skip consumers that are backed up).
        for (const c of s.consumers) if (c.readyState === WebSocket.OPEN && c.bufferedAmount < 2_000_000) c.send(buf);
        // Motion detection is sampled, not per-frame, to keep CPU low.
        if (decoded.header.seq % 3 === 0) void s.motion.feed(decoded.jpeg);
      });
      ws.on("close", () => {
        if (s.producer === ws) s.producer = undefined;
        broadcast({ type: "source.status", source: s.id, kind: s.kind, online: false, fps: 0 });
      });
    } else if (url.pathname === "/consume") {
      const s = source(sid);
      s.consumers.add(ws);
      const latest = s.ring.latest();
      if (latest) ws.send(encodeFrame(latest.header, latest.jpeg));
      ws.on("close", () => s.consumers.delete(ws));
    } else if (url.pathname === "/control") {
      control.add(ws);
      ws.on("message", (data) => {
        try {
          broadcast(JSON.parse(data.toString()) as ControlMessage);
        } catch {
          /* ignore malformed */
        }
      });
      ws.on("close", () => control.delete(ws));
    } else {
      ws.close(1008, "unknown endpoint");
    }
  });
});

server.listen(PORT, () => {
  console.log(`stream-hub listening on http://0.0.0.0:${PORT}  (ws: /produce /consume /control)`);
});
