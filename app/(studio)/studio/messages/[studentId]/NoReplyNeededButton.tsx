"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

/**
 * docs/decisions/0178 — "No reply needed" on a Studio thread the student
 * wrote last. Posts to /api/messages/dismiss and refreshes, so the page and
 * the layout's Messages badge re-read message_threads (092 decides). Shown
 * by the page only while the thread is unanswered; the student's next
 * message makes it unanswered again. A refusal is shown inline, like the
 * composer's.
 */
const OUTLINED_BUTTON_CLASS =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50";

export function NoReplyNeededButton({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function dismiss() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/messages/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Could not update the conversation. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not update the conversation. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="text-sm text-muted-foreground">
          Nothing to add? Take this conversation off your unanswered list. If the student writes again, it comes back.
        </p>
        <button type="button" onClick={dismiss} disabled={busy} className={`${OUTLINED_BUTTON_CLASS} shrink-0`}>
          <Check size={16} aria-hidden />
          {busy ? "Saving…" : "No reply needed"}
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive-border bg-destructive-subtle px-3 py-2 text-sm text-destructive-text"
        >
          {error}
        </p>
      )}
    </div>
  );
}
