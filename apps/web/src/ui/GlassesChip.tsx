"use client";
// Persistent header chip: glasses online/offline, fps, last-frame age (PRD §7).
import { useEffect, useState } from "react";
import { frameAgeSeconds, usePrimarySource } from "@/lib/sources";

export function GlassesChip() {
  const { glasses, glassesOnline, hubOnline, source } = usePrimarySource();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!hubOnline) return <span className="chip warn" title="stream hub unreachable">hub offline</span>;
  if (!glassesOnline) {
    const fallback = source?.online ? ` · using ${source.id}` : "";
    return (
      <span className="chip warn" title="Put on the glasses and start the bridge, or open /source/phone">
        glasses offline{fallback}
      </span>
    );
  }
  const age = frameAgeSeconds(glasses, now);
  const stale = age != null && age > 3;
  return (
    <span className={`chip ${stale ? "warn" : "ok"}`} title={`source ${glasses!.id}`}>
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "currentColor" }} />
      glasses · {glasses!.fps.toFixed(0)} fps · {age == null ? "—" : age < 1 ? "<1 s" : `${age.toFixed(0)} s`} ago
    </span>
  );
}
