import WebSocket from "ws";
import { encodeFrame } from "../src/protocol.js";
const ws = new WebSocket("ws://127.0.0.1:8799/produce?source=test&kind=phone");
await new Promise((r) => ws.on("open", r));
// A real 1x1 JPEG so sharp can decode it for the motion detector.
const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
for (let i = 1; i <= 3; i++) ws.send(encodeFrame({ v: 1, sourceId: "test", seq: i, ts: Date.now(), w: 1, h: 1, mime: "image/jpeg" }, jpeg));
await new Promise((r) => setTimeout(r, 300));
const latest = await fetch("http://127.0.0.1:8799/frames/latest?source=test");
console.log("latest:", latest.status, latest.headers.get("x-seq"), (await latest.arrayBuffer()).byteLength, "bytes");
console.log("sources:", await (await fetch("http://127.0.0.1:8799/sources")).text());
const job = await (await fetch("http://127.0.0.1:8799/probe/jobs", { method: "POST", body: JSON.stringify({ board: "unoq1", probes: [{ pin: "A0", mode: "analogRead" }] }) })).json();
await fetch("http://127.0.0.1:8799/probe/results", { method: "POST", body: JSON.stringify({ jobId: job.id, results: [{ pin: "A0", value: 512 }] }) });
console.log("job:", await (await fetch(`http://127.0.0.1:8799/probe/jobs/${job.id}`)).text());
ws.close();
process.exit(0);
