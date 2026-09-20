"use client";
// "Teach the scanner": freeze on the last frame the model saw, let the user fix the inventory
// list so it matches that frame exactly, then save frame + truth as a correction case.
// Saved cases are scored by `pnpm eval:vision` and fed back as few-shot exemplars.
import { useEffect, useMemo, useState } from "react";
import type { DomainId, Inventory } from "@/core/types";
import {
  fetchFeedbackStats,
  postCorrection,
  type FeedbackStats,
} from "@/lib/feedback-client";
import { DOMAIN_LABEL, partLabel } from "@/lib/format";
import type { ScanSample } from "./useLiveInventory";

export function TeachPanel({
  domain,
  sample,
  inventory,
  onTeaching,
}: {
  domain: DomainId;
  sample: ScanSample | null;
  inventory: Inventory;
  /** Called with true while the user is correcting (the caller freezes the live loop) and false afterwards. */
  onTeaching: (active: boolean) => void;
}) {
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [teaching, setTeaching] = useState<ScanSample | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchFeedbackStats(domain)
      .then(setStats)
      .catch(() => setStats(null));
  }, [domain]);

  const preview = useMemo(() => (teaching ? URL.createObjectURL(teaching.blob) : null), [teaching]);
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const start = () => {
    if (!sample) return;
    setMessage(null);
    setTeaching(sample);
    onTeaching(true);
  };
  const stop = () => {
    setTeaching(null);
    onTeaching(false);
  };

  const save = async () => {
    if (!teaching) return;
    setBusy(true);
    try {
      const res = await postCorrection({
        domain,
        sourceId: teaching.sourceId,
        frame: teaching.blob,
        items: inventory.items,
        predicted: teaching.predicted,
      });
      setStats(res.stats);
      setMessage(
        `Saved: ${res.saved.items} labelled rows, ${res.saved.rejected} rejected crops. The scanner uses this from the next frame on.`,
      );
      stop();
    } catch (e) {
      setMessage(`Could not save: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const predictedLabel = (it: ScanSample["predicted"][number]) =>
    `${it.qty} × ${it.color ? `${it.color} ` : ""}${partLabel(domain, it.partType)}`;

  return (
    <div className="panel px-3 py-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className="font-medium">Teach the scanner</span>
        <span className="muted">
          {stats
            ? `${stats.count} ${DOMAIN_LABEL[domain]} example${stats.count === 1 ? "" : "s"} saved`
            : "examples unavailable"}
        </span>
        {!teaching && (
          <button
            className="btn sm ml-auto"
            onClick={start}
            disabled={!sample}
            title={
              sample
                ? "Freeze on the last scanned frame and correct what it found"
                : "Scan a frame first"
            }
          >
            Correct last scan
          </button>
        )}
      </div>
      {teaching && (
        <div className="grid sm:grid-cols-[160px_1fr] gap-3 items-start">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="frame being corrected"
              className="rounded-lg w-full object-contain"
              style={{ maxHeight: 140 }}
            />
          )}
          <div className="space-y-2 text-sm min-w-0">
            <p>
              Fix the inventory list on the right until it lists <b>exactly</b>{" "}
              what is in this frame: remove anything that is not there, add what
              was missed, correct types and colors. Then save.
            </p>
            <p className="muted text-xs break-words">
              Scanner said:{" "}
              {teaching.predicted.length
                ? teaching.predicted.map(predictedLabel).join(", ")
                : "nothing"}
            </p>
            <div className="flex gap-2">
              <button className="btn sm primary" onClick={save} disabled={busy}>
                {busy ? "Saving…" : "Save as example"}
              </button>
              <button className="btn sm" onClick={stop} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {message && <div className="text-xs muted">{message}</div>}
    </div>
  );
}
