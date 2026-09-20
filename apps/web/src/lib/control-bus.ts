// Client control-bus WebSocket subscription.
"use client";

import { useEffect, useRef } from "react";
import { HUB_WS } from "@/lib/hub";

export type ControlMessage =
  | { type: "scan.start"; source?: string; seconds?: number }
  | { type: "scan.stop" }
  | { type: "check"; step?: number }
  | { type: "next" }
  | { type: "prev" }
  | { type: "say"; text: string }
  | { type: "inventory.updated"; domain: string; count: number }
  | { type: "step.activated"; manualId: string; step: number; text: string }
  | { type: "verify.result"; manualId: string; step: number; status: string; hint?: string }
  | { type: "motion"; source: string; state: "active" | "settled"; score: number }
  | { type: "source.status"; source: string; kind: string; online: boolean; fps: number };

export function useControlBus(onMessage: (msg: ControlMessage) => void) {
  const callback = useRef(onMessage);
  useEffect(() => {
    callback.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ws: WebSocket | undefined;

    const connect = () => {
      if (!mounted) return;
      ws = new WebSocket(`${HUB_WS}/control`);
      ws.onmessage = (event) => {
        try {
          callback.current(JSON.parse(event.data as string) as ControlMessage);
        } catch {
          return;
        }
      };
      ws.onclose = () => {
        if (mounted) timer = setTimeout(connect, 2000);
      };
    };

    connect();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, []);
}
