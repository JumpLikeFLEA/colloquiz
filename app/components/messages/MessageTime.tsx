"use client";

import { useSyncExternalStore } from "react";

// TCH-004 — a message's send time in the viewer's own timezone. The server
// renders the instant in UTC (readable without JS, and identical during
// hydration, because useSyncExternalStore's server snapshot is used for both),
// then the client snapshot re-renders it locally: no effect, no setState (the
// English LocalDateTime and Studio LocalTime precedent). Shorter than either,
// because a thread shows one per message.
const noopSubscribe = () => () => {};

const FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

export function MessageTime({ iso, locale }: { iso: string; locale: "en-GB" | "ru-RU" }) {
  const text = useSyncExternalStore(
    noopSubscribe,
    () => new Date(iso).toLocaleString(locale, FORMAT),
    () => new Date(iso).toLocaleString(locale, { ...FORMAT, timeZone: "UTC" }) + " UTC",
  );
  return <time dateTime={iso}>{text}</time>;
}
