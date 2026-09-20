"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface SyncSummary {
  added: string[];
  changed: string[];
  removed: string[];
  errors: string[];
}

export function LibrarySync({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(timer);
  }, [router]);

  async function syncNow() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/dropbox/sync", { method: "POST" });
      const body = (await response.json()) as SyncSummary & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Sync failed");
      setSummary(body);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSummary(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button className="btn sm" disabled={!connected || busy} onClick={syncNow}>
        {busy ? "Syncing…" : "Sync now"}
      </button>
      {summary && (
        <>
          <span className="chip ok">added · {summary.added.length}</span>
          <span className="chip info">changed · {summary.changed.length}</span>
          <span className="chip muted">removed · {summary.removed.length}</span>
          <span className={summary.errors.length ? "chip warn" : "chip muted"}>errors · {summary.errors.length}</span>
        </>
      )}
      {error && <span className="chip warn">{error}</span>}
    </div>
  );
}
