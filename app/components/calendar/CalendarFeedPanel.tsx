"use client";

import { useRef, useState } from "react";
import { calendarCopy, type CalendarLang } from "./calendarCopy";

// COH-016 (docs/decisions/0160) — "Subscribe in your calendar". The address is
// created by rotate_calendar_feed_token() and returned ONCE: only its hash is
// stored, so after this page is left it can be replaced but not shown again.
// A plain fetch to /api/calendar-feed, not a Server Action: a Server Action
// would re-render the page it sits on (docs/decisions/0086 on the same trap).

const BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-subtle px-4 py-2.5 text-sm font-medium text-brand-text outline-none transition-colors hover:bg-brand-subtle-hover focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50";
const QUIET_BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50";

type Phase = "idle" | "confirm" | "busy";

export function CalendarFeedPanel({
  hasToken: initialHasToken,
  createdLabel,
  lang,
}: {
  hasToken: boolean;
  /** The creation date, already formatted on the server (no client Intl to mismatch). */
  createdLabel: string | null;
  lang: CalendarLang;
}) {
  const c = calendarCopy[lang];
  const [hasToken, setHasToken] = useState(initialHasToken);
  const [url, setUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [off, setOff] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function call(body: Record<string, string>): Promise<Record<string, unknown> | null> {
    setError(false);
    setPhase("busy");
    try {
      const res = await fetch("/api/calendar-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as Record<string, unknown>;
    } catch {
      setError(true);
      return null;
    } finally {
      setPhase("idle");
    }
  }

  async function rotate() {
    const out = await call({ action: "rotate", lang });
    if (out && typeof out.url === "string") {
      setUrl(out.url);
      setHasToken(true);
      setOff(false);
      setCopied(false);
    }
  }

  async function turnOff() {
    const out = await call({ action: "revoke" });
    if (out) {
      setUrl(null);
      setHasToken(false);
      setOff(true);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard permission (an in-app browser): select the text so the
      // person can copy it by hand.
      input.current?.select();
    }
  }

  const busy = phase === "busy";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5" data-calendar-feed>
      <h3 className="text-base font-semibold text-foreground">{c.feedTitle}</h3>
      <p className="text-sm text-muted-foreground">{c.feedLead}</p>

      {url && (
        <div className="flex flex-col gap-2">
          <label htmlFor="calendar-feed-url" className="text-xs font-medium text-foreground">
            {c.feedYourLink}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="calendar-feed-url"
              ref={input}
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
            <button type="button" onClick={copy} className={BUTTON_CLASS}>
              {copied ? c.feedCopied : c.feedCopy}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{c.feedPrivate}</p>
        </div>
      )}

      {!url && hasToken && <p className="text-sm text-muted-foreground">{c.feedHasLink(createdLabel)}</p>}
      {!url && !hasToken && off && <p className="text-sm text-muted-foreground">{c.feedIsOff}</p>}

      {phase === "confirm" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-foreground">{c.feedReplaceConfirm}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={rotate} className={BUTTON_CLASS}>
              {c.feedReplaceYes}
            </button>
            <button type="button" onClick={() => setPhase("idle")} className={QUIET_BUTTON_CLASS}>
              {c.feedCancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {hasToken ? (
            <>
              <button type="button" onClick={() => setPhase("confirm")} disabled={busy} className={BUTTON_CLASS}>
                {c.feedReplace}
              </button>
              <button type="button" onClick={turnOff} disabled={busy} className={QUIET_BUTTON_CLASS}>
                {c.feedTurnOff}
              </button>
            </>
          ) : (
            <button type="button" onClick={rotate} disabled={busy} className={BUTTON_CLASS}>
              {c.feedCreate}
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-destructive-border bg-destructive-subtle px-3 py-2 text-sm text-destructive-text" role="alert">
          {c.feedError}
        </p>
      )}
    </div>
  );
}
