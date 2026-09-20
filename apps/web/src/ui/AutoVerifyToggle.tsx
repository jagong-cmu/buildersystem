"use client";
import { useAutoVerifyPref } from "./useHandsFree";

export function AutoVerifyToggle() {
  const [on, set] = useAutoVerifyPref();
  return (
    <button className="btn sm" onClick={() => set(!on)} title="Run the vision check automatically when your hands leave the frame">
      {on ? "Auto-verify on" : "Auto-verify off"}
    </button>
  );
}
