// Narration preference toggle.
"use client";

import { useNarration } from "./useNarration";

export function NarrationToggle() {
  const [enabled, setEnabled] = useNarration();
  return (
    <button className="btn sm" onClick={() => setEnabled(!enabled)}>
      {enabled ? "🔈 Narration on" : "🔇 Narration off"}
    </button>
  );
}
