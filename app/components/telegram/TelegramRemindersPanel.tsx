"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TelegramPanelCopy } from "./telegramCopy";

// COH-010 (docs/decisions/0173) — "Get reminders in Telegram". The deep link is
// created by create_telegram_link_token() and returned once, inside the URL; only
// its hash is stored. A plain fetch to /api/telegram/link, not a Server Action: a
// Server Action would re-render the page it sits on (docs/decisions/0086). The
// copy arrives as a prop from the server page, so only one language is shipped.

const BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-subtle px-4 py-2.5 text-sm font-medium text-brand-text outline-none transition-colors hover:bg-brand-subtle-hover focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50";
const QUIET_BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50";

export function TelegramRemindersPanel({
  linked,
  lang,
  copy,
}: {
  /** Reminders on, read on the server (my_telegram_link). */
  linked: boolean;
  lang: "ru" | "en";
  copy: TelegramPanelCopy;
}) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [turnedOff, setTurnedOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function call(body: Record<string, string>): Promise<Record<string, unknown> | null> {
    setError(false);
    setBusy(true);
    try {
      const res = await fetch("/api/telegram/link", {
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
      setBusy(false);
    }
  }

  async function create() {
    let timeZone = "";
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
      // No Intl zone: the link is saved without one and the bot treats it as unknown.
    }
    const out = await call({ action: "create", lang, ...(timeZone ? { timeZone } : {}) });
    if (out && typeof out.url === "string") {
      setUrl(out.url);
      setTurnedOff(false);
    }
  }

  async function turnOff() {
    const out = await call({ action: "stop" });
    if (out) {
      setUrl(null);
      setTurnedOff(true);
      router.refresh();
    }
  }

  const isOn = linked && !turnedOff;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5" data-telegram-reminders>
      <h3 className="text-base font-semibold text-foreground">{copy.title}</h3>
      <p className="text-sm text-muted-foreground">{isOn ? copy.leadOn : copy.leadOff}</p>

      {!isOn && url && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{copy.pendingHint}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a href={url} target="_blank" rel="noopener noreferrer" className={BUTTON_CLASS}>
              {copy.open}
            </a>
            <button type="button" onClick={() => router.refresh()} className={QUIET_BUTTON_CLASS}>
              {copy.check}
            </button>
          </div>
        </div>
      )}

      {!isOn && !url && turnedOff && <p className="text-sm text-muted-foreground">{copy.isOff}</p>}

      {error && (
        <p role="alert" className="rounded-xl border border-destructive-border bg-destructive-subtle px-3 py-2 text-sm text-destructive-text">
          {copy.error}
        </p>
      )}

      {isOn ? (
        <div>
          <button type="button" onClick={turnOff} disabled={busy} className={QUIET_BUTTON_CLASS}>
            {copy.turnOff}
          </button>
        </div>
      ) : (
        !url && (
          <div>
            <button type="button" onClick={create} disabled={busy} className={BUTTON_CLASS}>
              {copy.get}
            </button>
          </div>
        )
      )}
    </div>
  );
}
