import { getDropboxStatus } from "@/lib/dropbox/client";
import { DropboxConnection } from "@/ui/DropboxConnection";

export const runtime = "nodejs";

export default async function LibraryPage() {
  const status = await getDropboxStatus();
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
          <button className="btn sm" disabled title="Dropbox sync arrives in Phase B">Sync now</button>
          <span className="muted">Last sync: —</span>
        </div>
      </section>
      <section className="panel p-5 space-y-2">
        <h2 className="font-semibold">Manuals</h2>
        <p className="muted text-sm">Dropbox manuals will appear here after Phase B sync.</p>
      </section>
      <section className="panel p-5 space-y-2">
        <h2 className="font-semibold">Build records</h2>
        <p className="muted text-sm">Saved build records will appear here once Dropbox is connected.</p>
      </section>
    </div>
  );
}
