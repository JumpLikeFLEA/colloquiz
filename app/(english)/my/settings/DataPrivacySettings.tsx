"use client";

import { useState } from "react";
import { AlertTriangle, Download, Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { EXPORT_ENDPOINT, exportFilename } from "@/lib/accountExport";
import { DELETE_CONFIRM_PHRASE, DELETE_ENDPOINT, type DeleteBlockingGroup } from "@/lib/accountDelete";
import type { DataLabels } from "./settingsCopy";

/** Where a learner lands once the account is gone: the English sign-in panel
 * (`next` outside /app, lib/authRedirect.ts) with its closed-account notice
 * (docs/decisions/0181 Decision 6). */
export const ACCOUNT_DELETED_DEST = "/login?next=/&notice=account_deleted";

/**
 * Export and account deletion on `/my/settings` (docs/decisions/0181): the
 * Colloquiz DataPrivacySection's two halves, against the same endpoints, with
 * the English surface's copy. Deletion is anonymisation (ADR 0002); the
 * dialog's list follows privacy policy §9. The server is the authority on
 * both: the export route counts and caps requests, and delete_my_account
 * refuses with the blocking groups for an owner of a Colloquiz group with
 * other members, which is the one place this page links into /app.
 */
export function DataPrivacySettings({ labels }: { labels: DataLabels }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(EXPORT_ENDPOINT);
      if (!res.ok) {
        setError(res.status === 429 ? labels.exportRateLimited : labels.exportFailed.replace("{status}", String(res.status)));
        return;
      }
      const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
      const filename = match?.[1] ?? exportFilename(new Date());
      const url = URL.createObjectURL(await res.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setError(labels.exportNetwork);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div>
          <p className="text-sm font-medium text-foreground">{labels.exportTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{labels.exportBody}</p>
        </div>
        <div className="flex flex-col items-start gap-2">
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={busy}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-brand-subtle px-4 py-2 text-sm font-medium text-brand-text transition-colors hover:bg-brand-subtle-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
            {busy ? labels.exportBusy : labels.exportButton}
          </button>
          {error && <p className="text-xs text-destructive-text" role="alert">{error}</p>}
        </div>
      </div>

      <DeleteAccountBlock labels={labels} />
    </div>
  );
}

function DeleteAccountBlock({ labels }: { labels: DataLabels }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<DeleteBlockingGroup[] | null>(null);

  const armed = confirmText.trim() === DELETE_CONFIRM_PHRASE;

  function reset() {
    setConfirmText("");
    setError(null);
    setBlocking(null);
    setBusy(false);
  }

  async function handleDelete() {
    if (!armed) return;
    setError(null);
    setBlocking(null);
    setBusy(true);
    try {
      const res = await fetch(DELETE_ENDPOINT, { method: "POST" });
      if (res.status === 409) {
        const body = await res.json().catch(() => null);
        setBlocking(body?.groups ?? []);
        return;
      }
      if (!res.ok) {
        setError(labels.deleteFailed.replace("{status}", String(res.status)));
        return;
      }
      // The session is cleared server-side; a full navigation makes the
      // cleared cookies take effect.
      window.location.href = ACCOUNT_DELETED_DEST;
    } catch {
      setError(labels.deleteNetwork);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-destructive-border bg-destructive-subtle p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-destructive-text" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-destructive-text">{labels.deleteTitle}</p>
          <p className="mt-1 text-xs text-destructive-text/80">{labels.deleteBody}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => { reset(); setOpen(true); }}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-xl border border-destructive-border bg-card px-4 py-2 text-sm font-medium text-destructive-text transition-colors hover:bg-destructive-subtle"
      >
        <Trash2 size={15} aria-hidden="true" />
        {labels.deleteButton}
      </button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); setOpen(o); }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{labels.dialogTitle}</DialogTitle>
            <DialogDescription>{labels.dialogDescription}</DialogDescription>
          </DialogHeader>

          <ul className="flex flex-col gap-1.5">
            {labels.effects.map((line) => (
              <li key={line} className="flex gap-2 text-sm text-muted-foreground">
                <span aria-hidden="true" className="text-destructive-text">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-muted-foreground">{labels.retained}</p>

          {blocking && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-destructive-border bg-destructive-subtle px-3 py-2 text-sm text-destructive-text" role="alert">
              <span>{labels.ownsGroups}</span>
              <ul className="flex flex-col gap-1">
                {blocking.map((g) => (
                  <li key={g.id}>
                    {/* A full load: /app is another root layout. */}
                    <a href={`/app/groups/${g.id}`} className="break-words font-medium underline hover:no-underline">
                      {g.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="delete-confirm" className="text-xs text-muted-foreground">
              {labels.confirmBefore} <span className="font-mono font-medium text-foreground">{DELETE_CONFIRM_PHRASE}</span>{" "}
              {labels.confirmAfter}
            </label>
            <Input
              id="delete-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder={DELETE_CONFIRM_PHRASE}
            />
          </div>

          {error && <p className="text-sm text-destructive-text" role="alert">{error}</p>}

          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-11 cursor-pointer rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              {labels.cancel}
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={!armed || busy}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-destructive-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />}
              {busy ? labels.deleting : labels.deleteButton}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
