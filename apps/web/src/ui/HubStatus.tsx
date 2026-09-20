"use client";
import { useEffect, useState } from "react";
import { fetchSources, HUB_HTTP, type SourceStatus } from "@/lib/hub";

export function HubStatus() {
  const [sources, setSources] = useState<SourceStatus[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = () =>
      fetchSources()
        .then((s) => alive && (setSources(s), setErr(null)))
        .catch((e) => alive && setErr(String(e.message ?? e)));
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  if (err)
    return (
      <div className="text-sm">
        <span className="chip warn">hub offline</span> <span className="muted mono text-xs">{HUB_HTTP}</span>
        <div className="muted text-xs mt-1">Start it with <span className="mono">pnpm dev:hub</span>.</div>
      </div>
    );
  if (!sources) return <div className="muted text-sm">connecting…</div>;
  if (!sources.length) return <div className="muted text-sm">hub online, no sources yet — open <span className="mono">/source/phone</span> on a phone.</div>;
  return (
    <ul className="text-sm space-y-1">
      {sources.map((s) => (
        <li key={s.id} className="flex items-center gap-2">
          <span className={`chip ${s.online ? "ok" : "warn"}`}>{s.online ? "online" : "offline"}</span>
          <span className="mono">{s.id}</span>
          <span className="muted">{s.kind}</span>
          <span className="muted ml-auto">{s.fps.toFixed(1)} fps · {s.frames} buffered</span>
        </li>
      ))}
    </ul>
  );
}
