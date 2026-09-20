"use client";
// Consumes one hub source over WebSocket and paints the latest JPEG (PRD §5.2, §8).
import { useEffect, useRef, useState } from "react";
import { decodeFrameMessage, fetchSources, HUB_WS, type SourceStatus } from "@/lib/hub";

export function LiveFeed({
  onSnapshot,
  busy,
  compact,
  onSourceChange,
}: {
  onSnapshot?: (blob: Blob, sourceId: string) => void;
  busy?: string | null;
  compact?: boolean;
  onSourceChange?: (id: string) => void;
}) {
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [sourceId, setSourceId] = useState<string>("");
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const imgRef = useRef<HTMLImageElement>(null);
  const lastBlob = useRef<Blob | null>(null);
  const onSourceChangeRef = useRef(onSourceChange);
  useEffect(() => {
    onSourceChangeRef.current = onSourceChange;
  }, [onSourceChange]);

  useEffect(() => {
    onSourceChangeRef.current?.(sourceId);
  }, [sourceId]);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      fetchSources()
        .then((s) => {
          if (!alive) return;
          setSources(s);
          setSourceId((cur) => cur || s.find((x) => x.online)?.id || s[0]?.id || "");
        })
        .catch(() => alive && setStatus("offline"));
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!sourceId) return;
    const ws = new WebSocket(`${HUB_WS}/consume?source=${encodeURIComponent(sourceId)}`);
    ws.binaryType = "arraybuffer";
    let url: string | null = null;
    ws.onopen = () => setStatus("connecting");
    ws.onmessage = (ev) => {
      const { jpeg } = decodeFrameMessage(ev.data as ArrayBuffer);
      lastBlob.current = jpeg;
      const next = URL.createObjectURL(jpeg);
      if (imgRef.current) imgRef.current.src = next;
      if (url) URL.revokeObjectURL(url);
      url = next;
      setStatus("live");
    };
    ws.onclose = () => setStatus("offline");
    ws.onerror = () => setStatus("offline");
    return () => {
      ws.close();
      if (url) URL.revokeObjectURL(url);
    };
  }, [sourceId]);

  return (
    <div className="panel overflow-hidden">
      <div className="relative bg-black" style={{ aspectRatio: compact ? "4 / 3" : "16 / 10" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} alt="live feed" className="absolute inset-0 w-full h-full object-contain" />
        {status !== "live" && (
          <div className="absolute inset-0 grid place-items-center text-sm muted text-center px-6">
            {status === "offline" ? (
              <div>
                No live source. Start the hub (<span className="mono">pnpm dev:hub</span>) and open <span className="mono">/source/phone</span> on a phone, or upload a photo.
              </div>
            ) : (
              "connecting…"
            )}
          </div>
        )}
      </div>
      {!compact && (
        <div className="flex items-center gap-2 px-3 py-2 text-sm" style={{ borderTop: "1px solid var(--line)" }}>
          <select className="btn sm" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            {sources.length === 0 && <option value="">no sources</option>}
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} ({s.kind}{s.online ? `, ${s.fps.toFixed(0)} fps` : ", offline"})
              </option>
            ))}
          </select>
          <span className={`chip ${status === "live" ? "ok" : "warn"}`}>{status}</span>
          {onSnapshot && (
            <button
              className="btn primary sm ml-auto"
              disabled={status !== "live" || !!busy}
              onClick={() => lastBlob.current && onSnapshot(lastBlob.current, sourceId)}
            >
              Snap &amp; identify
            </button>
          )}
        </div>
      )}
    </div>
  );
}
