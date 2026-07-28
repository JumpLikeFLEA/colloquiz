"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import {
  EXPORT_CONTENTS,
  EXPORT_ENDPOINT,
  exportFilename,
} from "@/lib/accountExport";

/**
 * Data export.
 *
 * The download is driven through fetch rather than a plain <a download> so a
 * failure surfaces as a message in the page instead of navigating the user to a
 * JSON error body.
 *
 * Account deletion belongs in this section too, below a danger-zone divider —
 * it is not built yet, pending a decision on what happens to content other
 * users depend on. Nothing is rendered for it: a delete control that cannot
 * delete is worse than its absence.
 */
export function DataPrivacySection() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(EXPORT_ENDPOINT);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Export failed (${res.status}).`);
        return;
      }

      // Prefer the filename the server chose; fall back to the same rule.
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? exportFilename(new Date());

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Give the download a tick to start before dropping the blob.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setError("Export failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-5 rounded-2xl border border-border bg-card flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium text-foreground">Export your data</p>
        <p className="text-xs text-muted-foreground mt-1">
          A machine-readable JSON file of everything this account holds. Yours to keep,
          move, or feed into anything else.
        </p>
      </div>

      <ul className="flex flex-col gap-1">
        {EXPORT_CONTENTS.map(line => (
          <li key={line} className="text-xs text-muted-foreground flex gap-2">
            <span aria-hidden className="text-border">•</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 items-start">
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-subtle text-brand-text hover:bg-brand-subtle-hover transition-colors text-sm font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          {busy ? "Preparing…" : "Download export"}
        </button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
