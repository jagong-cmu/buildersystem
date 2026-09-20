// Narration preference and control-bus speech.
"use client";

import { useCallback, useEffect, useState } from "react";
import { useControlBus } from "@/lib/control-bus";

export function useNarration(): [enabled: boolean, setEnabled: (v: boolean) => void] {
  const [enabled, setState] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setState(localStorage.getItem("rc:narration") === "on"), 0);
    return () => clearTimeout(timer);
  }, []);
  const setEnabled = useCallback((value: boolean) => {
    setState(value);
    localStorage.setItem("rc:narration", value ? "on" : "off");
  }, []);
  useControlBus((msg) => {
    if (!enabled || msg.type !== "say" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(msg.text));
  });
  return [enabled, setEnabled];
}
