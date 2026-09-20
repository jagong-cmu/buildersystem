"use client";
import { useEffect, useRef, useState } from "react";
import { encodeFrameMessage, HUB_WS, sendControl } from "@/lib/hub";

const FPS = 8;
const MAX_W = 960;

export function PhoneSource() {
  const [hub, setHub] = useState(HUB_WS);
  const [sourceId, setSourceId] = useState("phone");
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState({ sent: 0, fps: 0, state: "idle" as "idle" | "connecting" | "streaming" | "error", err: "" });
  const videoRef = useRef<HTMLVideoElement>(null);
  const stop = useRef<() => void>(() => {});

  useEffect(() => {
    // Remember the hub URL per phone; the laptop's LAN IP changes between venues.
    try {
      const saved = localStorage.getItem("rc:hub");
      if (saved) setHub(saved);
    } catch {}
  }, []);

  async function start() {
    setStats((s) => ({ ...s, state: "connecting", err: "" }));
    try {
      localStorage.setItem("rc:hub", hub);
    } catch {}
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
    } catch (e) {
      setStats((s) => ({ ...s, state: "error", err: `camera: ${(e as Error).message}` }));
      return;
    }
    const video = videoRef.current!;
    video.srcObject = stream;
    await video.play();
    const ws = new WebSocket(`${hub}/produce?source=${encodeURIComponent(sourceId)}&kind=phone`);
    ws.binaryType = "arraybuffer";
    const canvas = document.createElement("canvas");
    let seq = 0, sent = 0, windowStart = Date.now(), timer = 0;
    ws.onopen = () => {
      setStats((s) => ({ ...s, state: "streaming" }));
      timer = window.setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 1_000_000) return;
        const scale = Math.min(1, MAX_W / (video.videoWidth || MAX_W));
        canvas.width = Math.round((video.videoWidth || 640) * scale);
        canvas.height = Math.round((video.videoHeight || 480) * scale);
        canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          async (blob) => {
            if (!blob || ws.readyState !== WebSocket.OPEN) return;
            const header = { v: 1, sourceId, seq: ++seq, ts: Date.now(), w: canvas.width, h: canvas.height, mime: "image/jpeg" };
            ws.send(encodeFrameMessage(header, await blob.arrayBuffer()));
            sent++;
            const now = Date.now();
            if (now - windowStart >= 1000) {
              setStats((s) => ({ ...s, sent: s.sent + sent, fps: sent / ((now - windowStart) / 1000) }));
              sent = 0;
              windowStart = now;
            }
          },
          "image/jpeg",
          0.6,
        );
      }, 1000 / FPS);
    };
    ws.onerror = () => setStats((s) => ({ ...s, state: "error", err: "hub connection failed (is the hub running? same Wi-Fi? http not https?)" }));
    ws.onclose = () => setStats((s) => (s.state === "error" ? s : { ...s, state: "idle" }));
    stop.current = () => {
      clearInterval(timer);
      ws.close();
      stream.getTracks().forEach((t) => t.stop());
      setRunning(false);
      setStats((s) => ({ ...s, state: "idle" }));
    };
    setRunning(true);
  }

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <h1 className="text-lg font-semibold">Phone camera → hub</h1>
      <video ref={videoRef} playsInline muted className="w-full rounded-lg bg-black" style={{ aspectRatio: "4 / 3" }} />
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="space-y-1">
          <div className="muted">Hub</div>
          <input className="btn w-full" value={hub} onChange={(e) => setHub(e.target.value)} disabled={running} />
        </label>
        <label className="space-y-1">
          <div className="muted">Source id</div>
          <input className="btn w-full" value={sourceId} onChange={(e) => setSourceId(e.target.value)} disabled={running} />
        </label>
      </div>
      <div className="flex gap-2">
        {!running ? (
          <button className="btn primary" onClick={start}>
            Start streaming
          </button>
        ) : (
          <button className="btn" onClick={() => stop.current()}>
            Stop
          </button>
        )}
        <span className={`chip ${stats.state === "streaming" ? "ok" : stats.state === "error" ? "warn" : ""}`}>
          {stats.state} {stats.state === "streaming" ? `· ${stats.fps.toFixed(1)} fps · ${stats.sent} frames` : ""}
        </span>
      </div>
      {stats.err && <div className="chip warn">{stats.err}</div>}
      <div className="grid grid-cols-4 gap-2">
        {(["scan.start", "check", "prev", "next"] as const).map((t) => (
          <button key={t} className="btn" onClick={() => sendControl({ type: t })}>
            {t.replace(".start", "")}
          </button>
        ))}
      </div>
      <p className="muted text-xs">
        Camera access needs a secure context: on a phone use <span className="mono">http://localhost</span> via a tunnel, or run the web app with HTTPS
        (<span className="mono">next dev --experimental-https</span>) and set the hub to the laptop&apos;s LAN IP.
      </p>
    </div>
  );
}
