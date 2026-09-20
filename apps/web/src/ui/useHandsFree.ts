"use client";
// Header-level hands-free preferences (localStorage, shared across components).
import { useCallback, useSyncExternalStore } from "react";

function usePref(key: string, def: boolean): [boolean, (v: boolean) => void] {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener("rc:pref", cb);
    window.addEventListener("storage", cb);
    return () => {
      window.removeEventListener("rc:pref", cb);
      window.removeEventListener("storage", cb);
    };
  }, []);
  const read = useCallback(() => {
    try {
      const v = localStorage.getItem(key);
      return v == null ? def : v === "on";
    } catch {
      return def;
    }
  }, [key, def]);
  const value = useSyncExternalStore(subscribe, read, () => def);
  const set = useCallback(
    (v: boolean) => {
      try {
        localStorage.setItem(key, v ? "on" : "off");
      } catch {}
      window.dispatchEvent(new Event("rc:pref"));
    },
    [key],
  );
  return [value, set];
}

/** Auto-verify after motion settles (PRD §14.3). On by default. */
export function useAutoVerifyPref() {
  return usePref("rc:autoverify", true);
}

/** Keep the live inventory sampling while on /builds. Off by default. */
export function useBuildsLivePref() {
  return usePref("rc:builds-live", false);
}
