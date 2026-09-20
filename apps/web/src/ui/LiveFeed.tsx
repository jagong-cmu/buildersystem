"use client";
// Consumes one hub source over WebSocket and paints the latest JPEG (PRD §5.2, §8).
// Defaults to the primary source (glasses → phone → anything); the dropdown is an override.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { decodeFrameMessage, HUB_WS } from "@/lib/hub";
import { OFFLINE_GUIDANCE, usePrimarySource } from "@/lib/sources";

export interface FrameInfo {
  w: number;
  h: number;
  seq: number;
}

export function LiveFeed({
  onSnapshot,
  busy,
  compact,
  onSourceChange,
  onFrame,
  overlay,
  aspect,
}: {
  onSnapshot?: (blob: Blob, sourceId: string) => void;
  busy?: string | null;
  compact?: boolean;
  onSourceChange?: (id: string) => void;
  onFrame?: (info: FrameInfo) => void;
  /** Rendered over the image (e.g. FrameOverlay); receives the latest frame size. */
  overlay?: (frame: { w: number; h: number } | null) => ReactNode;
  aspect?: string;
}) {
  const { sources, sourceId: primaryId, hubOnline } = usePrimarySource();
  const [override, setOverride] = useState<string>("");
  const sourceId = override && sources.some((s) => s.id === override) ? override : primaryId;
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const lastBlob = useRef<Blob | null>(null);
  const onSourceChangeRef = useRef(onSourceChange);
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onSourceChangeRef.current = onSourceChange;
    onFrameRef.current = onFrame;
  }, [onSourceChange, onFrame]);

  useEffect(() => {
    onSourceChangeRef.current?.(sourceId);
  }, [sourceId]);

  useEffect(() => {
    if (!sourceId) return;
    const ws = new WebSocket(`${HUB_WS}/consume?source=${encodeURIComponent(sourceId)}`);
    ws.binaryType = "arraybuffer";
    let url: string | null = null;
    let lastSize = "";
    ws.onopen = () => setStatus("connecting");
    ws.onmessage = (ev) => {
      const { header, jpeg } = decodeFrameMessage(ev.data as ArrayBuffer);
      lastBlob.current = jpeg;
      const next = URL.createObjectURL(jpeg);
      if (imgRef.current) imgRef.current.src = next;
      if (url) URL.revokeObjectURL(url);
      url = next;
      const w = Number(header.w);
      const h = Number(header.h);
      if (w && h && `${w}x${h}` !== lastSize) {
        lastSize = `${w}x${h}`;
        setFrame({ w, h });
      }
      onFrameRef.current?.({ w, h, seq: Number(header.seq) });
      setStatus("live");
    };
    ws.onclose = () => setStatus("offline");
    ws.onerror = () => setStatus("offline");
    return () => {
      ws.close();
      if (url) URL.revokeObjectURL(url);
    };
  }, [sourceId]);

  const current = sources.find((s) => s.id === sourceId);
  const showFeed = !!sourceId && status === "live" && current?.online !== false;

  return (
    <div className="panel overflow-hidden">
      <div className="relative bg-black" style={{ aspectRatio: aspect ?? (compact ? "4 / 3" : "16 / 10") }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} alt="live feed" className="absolute inset-0 w-full h-full object-contain" style={{ opacity: showFeed ? 1 : 0.35 }} />
        {showFeed && overlay?.(frame)}
        {!showFeed && (
          <div className="absolute inset-0 grid place-items-center text-sm muted text-center px-6">
            {status === "offline" || !hubOnline || current?.online === false || !sourceId ? (
              <div>
                {hubOnline ? OFFLINE_GUIDANCE : (
                  <>
                    Hub offline — start it with <span className="mono">pnpm dev:hub</span>. {OFFLINE_GUIDANCE}
                  </>
                )}
              </div>
            ) : (
              "connecting…"
            )}
          </div>
        )}
        {compact && current && (
          <span className={`absolute left-2 top-2 chip ${showFeed ? "ok" : "warn"}`} style={{ backdropFilter: "blur(6px)" }}>
            {current.kind} · {showFeed ? `${current.fps.toFixed(0)} fps` : "offline"}
          </span>
        )}
      </div>
      {!compact && (
        <div className="flex items-center gap-2 px-3 py-2 text-sm" style={{ borderTop: "1px solid var(--line)" }}>
          <select className="btn sm" value={sourceId} onChange={(e) => setOverride(e.target.value)} aria-label="source">
            {sources.length === 0 && <option value="">no sources</option>}
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} ({s.kind}
                {s.online ? `, ${s.fps.toFixed(0)} fps` : ", offline"}){s.id === primaryId ? " · primary" : ""}
              </option>
            ))}
          </select>
          <span className={`chip ${status === "live" ? "ok" : "warn"}`}>{status}</span>
          {onSnapshot && (
            <button className="btn primary sm ml-auto" disabled={status !== "live" || !!busy} onClick={() => lastBlob.current && onSnapshot(lastBlob.current, sourceId)}>
              Snap &amp; identify
            </button>
          )}
        </div>
      )}
    </div>
  );
}
