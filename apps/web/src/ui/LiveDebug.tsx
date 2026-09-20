"use client";
// /live (PRD §5.5): sources, control-bus tail, probe queue. Not for judges; essential while building.
import { useEffect, useState } from "react";
import { HUB_HTTP, HUB_WS } from "@/lib/hub";
import { HubStatus } from "./HubStatus";
import { LiveFeed } from "./LiveFeed";

export function LiveDebug() {
  const [log, setLog] = useState<string[]>([]);
  const [jobs, setJobs] = useState<unknown[]>([]);
  useEffect(() => {
    const ws = new WebSocket(`${HUB_WS}/control`);
    ws.onmessage = (ev) => setLog((l) => [`${new Date().toLocaleTimeString()} ${ev.data}`, ...l].slice(0, 60));
    const id = setInterval(() => fetch(`${HUB_HTTP}/probe/jobs`).then((r) => r.json()).then(setJobs).catch(() => {}), 2000);
    return () => {
      ws.close();
      clearInterval(id);
    };
  }, []);
  return (
    <div className="max-w-6xl mx-auto p-5 grid lg:grid-cols-2 gap-5">
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Live</h1>
        <div className="panel p-4">
          <HubStatus />
        </div>
        <LiveFeed />
      </div>
      <div className="space-y-3">
        <div className="panel p-4">
          <div className="text-sm muted mb-2">Control bus</div>
          <pre className="mono text-xs whitespace-pre-wrap max-h-80 overflow-auto">{log.join("\n") || "waiting for messages…"}</pre>
        </div>
        <div className="panel p-4">
          <div className="text-sm muted mb-2">Pending probe jobs (UNO Q)</div>
          <pre className="mono text-xs whitespace-pre-wrap max-h-60 overflow-auto">{JSON.stringify(jobs, null, 1)}</pre>
        </div>
      </div>
    </div>
  );
}
