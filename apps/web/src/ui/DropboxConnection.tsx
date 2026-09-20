"use client";

interface DropboxConnectionProps {
  enabled: boolean;
  connected: boolean;
  account?: { name: string; email: string };
  error?: string;
}

export function DropboxConnection({ enabled, connected, account, error }: DropboxConnectionProps) {
  if (!enabled) return <span className="chip muted">not configured</span>;
  if (!connected) {
    return (
      <div className="flex items-center gap-2">
        <span className="chip warn">not connected</span>
        <a className="btn primary sm" href="/api/dropbox/auth">Connect Dropbox</a>
        {error && <span className="chip warn">{error}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="chip ok">connected</span>
      {account && <span className="muted text-sm">{account.name} · {account.email}</span>}
      <button
        className="btn sm"
        onClick={async () => {
          await fetch("/api/dropbox/disconnect", { method: "POST" });
          window.location.reload();
        }}
      >
        Disconnect
      </button>
    </div>
  );
}
