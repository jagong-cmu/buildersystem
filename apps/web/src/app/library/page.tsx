import { getDropboxStatus } from "@/lib/dropbox/client";
import { listLibrary } from "@/lib/manuals.server";
import { readSyncState } from "@/lib/dropbox/library";
import { DropboxConnection } from "@/ui/DropboxConnection";
import { LibrarySync } from "@/ui/LibrarySync";

export const runtime = "nodejs";

export default async function LibraryPage() {
  const status = await getDropboxStatus();
  const [library, syncState] = await Promise.all([listLibrary(), readSyncState()]);
  const lastSync = syncState.lastSync ? relativeTime(syncState.lastSync) : "—";
  return (
    <div className="max-w-5xl mx-auto px-5 py-8 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Library</h1>
        <p className="muted">Connect Dropbox to keep manuals and build records with you.</p>
      </div>
      <section className="panel p-5 space-y-4">
        <div className="flex flex-wrap items-start gap-4">
          <div>
            <h2 className="font-semibold">Dropbox</h2>
            <p className="muted text-sm">App Folder: <span className="mono">{status.root}</span></p>
          </div>
          <div className="ml-auto">
            <DropboxConnection enabled={status.enabled} connected={status.connected} account={"account" in status ? status.account : undefined} error={"error" in status ? status.error : undefined} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <LibrarySync connected={status.connected} />
          <span className="muted">Last sync: {lastSync}</span>
        </div>
      </section>
      <section className="panel p-5 space-y-2">
        <h2 className="font-semibold">Manuals</h2>
        {!library.length ? <p className="muted text-sm">No manuals found.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="muted text-left">
                <tr><th className="py-2 pr-4">Domain</th><th className="py-2 pr-4">ID</th><th className="py-2 pr-4">Source</th><th className="py-2 pr-4">Files</th><th className="py-2 pr-4">Status</th><th className="py-2">Guide</th></tr>
              </thead>
              <tbody>
                {library.map((entry) => (
                  <tr key={`${entry.domain}/${entry.id}`} className="border-t" style={{ borderColor: "var(--line)" }}>
                    <td className="py-2 pr-4 mono">{entry.domain}</td>
                    <td className="py-2 pr-4 mono">{entry.id}</td>
                    <td className="py-2 pr-4"><span className="chip info">{entry.source === "builtin" ? "built-in" : entry.overridesBuiltin ? "Dropbox (overrides built-in)" : "Dropbox"}</span></td>
                    <td className="py-2 pr-4">{entry.files.length ? entry.files.join(", ") : "—"}</td>
                    <td className="py-2 pr-4">
                      {entry.status === "ok" ? <span className="chip ok">ok</span> : entry.status === "pdf" ? <span className="chip info">PDF · Ingest</span> : entry.status === "draft" ? <a className="chip info" href={`/library/${entry.domain}/${entry.id}/review`}>draft · Review</a> : entry.status === "needs review" ? <a className="chip warn" href={`/library/${entry.domain}/${entry.id}/review`}>needs review</a> : <span className="chip warn" title={entry.error}>{entry.error ?? "error"}</span>}
                    </td>
                    <td className="py-2">{entry.status === "ok" && <a className="underline" href={`/guide/${entry.id}`}>Open guide</a>}{entry.status === "pdf" && <a className="btn sm" href={`/library/${entry.domain}/${entry.id}/review`}>Ingest</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel p-5 space-y-2">
        <h2 className="font-semibold">Build records</h2>
        <p className="muted text-sm">Saved build records will appear here once Dropbox is connected.</p>
      </section>
    </div>
  );
}

function relativeTime(timestamp: number) {
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const absolute = Math.abs(seconds);
  if (absolute < 60) return "just now";
  const unit = absolute < 3600 ? "minute" : absolute < 86400 ? "hour" : "day";
  const divisor = unit === "minute" ? 60 : unit === "hour" ? 3600 : 86400;
  const value = Math.round(seconds / divisor);
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(value, unit as Intl.RelativeTimeFormatUnit);
}
