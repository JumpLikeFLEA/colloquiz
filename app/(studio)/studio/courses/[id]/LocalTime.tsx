"use client";

import { useSyncExternalStore } from "react";

// AUTH-010 — run and call times are shown in the editor's own timezone, the
// one they were typed in (docs/decisions/0106 Decision 3). The server renders
// in its own zone (UTC on Vercel), so formatting there would differ from the
// browser's and fail hydration. useSyncExternalStore's server snapshot
// (false) renders a placeholder on the server and during hydration, then the
// client snapshot (true) renders the local value: no effect, no setState.
const noopSubscribe = () => () => {};

export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

const FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

/** `dateOnly`: "9 Oct 2026", e.g. to tell untitled runs apart (AUTH-012). */
export function LocalTime({ iso, dateOnly = false }: { iso: string; dateOnly?: boolean }) {
  const isClient = useIsClient();
  return (
    <time dateTime={iso}>
      {isClient ? new Date(iso).toLocaleString("en-GB", dateOnly ? DATE_FORMAT : FORMAT) : "…"}
    </time>
  );
}

/** "Europe/Belgrade" etc., for the "times are in your timezone" note. */
export function LocalTimeZone() {
  const isClient = useIsClient();
  return <>{isClient ? Intl.DateTimeFormat().resolvedOptions().timeZone : "…"}</>;
}
