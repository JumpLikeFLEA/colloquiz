"use client";

import { useState } from "react";
import Link from "next/link";
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
import {
  EXPORT_CONTENTS,
  EXPORT_ENDPOINT,
  exportFilename,
} from "@/lib/accountExport";
import {
  DELETE_CONFIRM_PHRASE,
  DELETE_EFFECTS,
  DELETE_ENDPOINT,
  DELETE_RETAINED,
  type DeleteBlockingGroup,
} from "@/lib/accountDelete";

/**
 * Data export + account deletion.
 *
 * The export download is driven through fetch (not a plain <a download>) so a
 * failure surfaces in the page instead of navigating to a JSON error body.
 *
 * Account deletion is anonymisation, not row-deletion (ADR 0002). It sits below
 * a danger-zone divider, behind a type-the-word confirm dialog, and points at
 * the export first — "download your data before you go" is the right ordering.
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
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setError("Export failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Export */}
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

      {/* Danger zone */}
      <DeleteAccountBlock />
    </div>
  );
}

function DeleteAccountBlock() {
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
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Deletion failed (${res.status}).`);
        return;
      }
      // Session is cleared server-side. Hard-navigate so the app shell unmounts
      // and the cleared cookies take effect.
      window.location.href = "/login?notice=account_deleted";
    } catch {
      setError("Deletion failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-5 rounded-2xl border border-destructive-border bg-destructive-subtle flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="text-destructive-text shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-destructive-text">Delete your account</p>
          <p className="text-xs text-destructive-text/80 mt-1">
            Closes your account and erases your personal details. This cannot be undone —
            export your data first if you want a copy.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => { reset(); setOpen(true); }}
        className="inline-flex items-center gap-2 self-start px-4 py-2 rounded-xl border border-destructive-border bg-card text-destructive-text hover:bg-destructive-subtle transition-colors text-sm font-medium cursor-pointer"
      >
        <Trash2 size={15} />
        Delete account
      </button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); setOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This is permanent and cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <ul className="flex flex-col gap-1.5">
            {DELETE_EFFECTS.map(line => (
              <li key={line} className="text-sm text-muted-foreground flex gap-2">
                <span aria-hidden className="text-destructive-text">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-muted-foreground">{DELETE_RETAINED}</p>

          {blocking && (
            <div className="text-sm rounded-lg border border-destructive-border bg-destructive-subtle px-3 py-2 text-destructive-text flex flex-col gap-1.5">
              <span>
                You still own {blocking.length === 1 ? "a group" : "groups"} with other
                members. Transfer ownership or remove the members first:
              </span>
              <ul className="flex flex-col gap-1">
                {blocking.map(g => (
                  <li key={g.id}>
                    <Link
                      href={`/app/groups/${g.id}`}
                      className="font-medium underline hover:no-underline"
                      onClick={() => setOpen(false)}
                    >
                      {g.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="delete-confirm" className="text-xs text-muted-foreground">
              Type <span className="font-mono font-medium text-foreground">{DELETE_CONFIRM_PHRASE}</span> to confirm
            </label>
            <Input
              id="delete-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              placeholder={DELETE_CONFIRM_PHRASE}
            />
          </div>

          {error && <p className="text-sm text-destructive-text">{error}</p>}

          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={!armed || busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-white text-sm font-medium hover:bg-destructive-hover transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              {busy ? "Deleting…" : "Delete account"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
