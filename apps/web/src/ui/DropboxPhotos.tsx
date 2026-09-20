"use client";

import { useEffect, useState } from "react";
import type { DomainId, Inventory } from "@/core/types";

interface Folder {
  path: string;
  count: number;
}

interface PhotoResult {
  path: string;
  items: { partType: string; qty: number; color?: string }[];
  scaled: boolean;
  error?: string;
}

export function DropboxPhotos({
  domain,
  inventory,
  onUse,
  onError,
}: {
  domain: DomainId;
  inventory: Inventory;
  onUse: (inventory: Inventory) => void;
  onError: (message: string) => void;
}) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folder, setFolder] = useState("");
  const [mode, setMode] = useState<"same-pile" | "different-bins">("same-pile");
  const [results, setResults] = useState<PhotoResult[]>([]);
  const [merged, setMerged] = useState<Inventory | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/dropbox/photos?domain=${domain}`)
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error ?? `HTTP ${response.status}`);
        return response.json() as Promise<{ folders: Folder[] }>;
      })
      .then((value) => {
        if (active) {
          setFolders(value.folders);
          setFolder(value.folders[0]?.path ?? "");
        }
      })
      .catch((error) => {
        if (active) onError((error as Error).message);
      });
    return () => {
      active = false;
    };
  }, [domain, onError]);

  async function scan() {
    if (!folder) return;
    setBusy("Scanning Dropbox photos…");
    setSaved(null);
    onError("");
    try {
      const response = await fetch("/api/dropbox/photos/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain, folder, mode }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`);
      setResults(value.perPhoto);
      setMerged(value.merged);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const value = merged ?? inventory;
    setBusy("Saving inventory to Dropbox…");
    onError("");
    try {
      const response = await fetch("/api/dropbox/inventory", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(value),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
      setSaved(`Saved ${result.path} · ${new Date(result.updatedAt).toLocaleString()}`);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function load() {
    setBusy("Loading inventory from Dropbox…");
    onError("");
    try {
      const response = await fetch(`/api/dropbox/inventory?domain=${domain}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
      setMerged(result);
      onUse(result);
      setSaved(`Loaded ${result.dropbox?.sources.length ?? 0} photos`);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">Dropbox photos</h2>
        <select className="input text-sm" value={folder} onChange={(event) => setFolder(event.target.value)}>
          <option value="">No photo folders</option>
          {folders.map((value) => <option key={value.path} value={value.path}>{value.path} ({value.count})</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "same-pile"} onChange={() => setMode("same-pile")} />
          Same pile (max)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "different-bins"} onChange={() => setMode("different-bins")} />
          Different bins (sum)
        </label>
        <button className="btn primary sm" onClick={scan} disabled={!folder || !!busy}>Scan Dropbox photos</button>
        <button className="btn sm" onClick={load} disabled={!!busy}>Load from Dropbox</button>
      </div>
      {busy && <p className="muted text-sm">{busy}</p>}
      {!!results.length && (
        <div className="space-y-1 text-sm">
          {results.map((result) => (
            <div key={result.path} className="flex items-center gap-2">
              <span className="mono truncate">{result.path.split("/").pop()}</span>
              {result.error ? <span className="chip warn">{result.error}</span> : <span className="chip ok">{result.items.reduce((sum, item) => sum + item.qty, 0)} items</span>}
              {result.scaled && <span className="chip info">downscaled</span>}
            </div>
          ))}
        </div>
      )}
      {merged && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="chip info">merged {merged.items.reduce((sum, item) => sum + item.qty, 0)} items</span>
          <button className="btn sm" onClick={() => onUse(merged)}>Use this inventory</button>
          <button className="btn sm" onClick={save} disabled={!!busy}>Save to Dropbox</button>
        </div>
      )}
      {saved && <span className="chip ok">{saved}</span>}
    </div>
  );
}
