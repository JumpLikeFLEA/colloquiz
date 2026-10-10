"use client";

import { useSyncExternalStore } from "react";

// COH-004 (docs/decisions/0108 Decision 3) — a cohort unlock moment or a
// call time, in the viewer's own timezone, with the zone named
// (docs/decisions/0093 "Calls"). The server does not know the viewer's zone,
// so it renders the instant in UTC ("… UTC"): readable without JS, and
// identical during hydration because useSyncExternalStore's server snapshot
// is used for both. The client snapshot then re-renders it in local time.
// No effect, no setState (the admin LocalTime.tsx precedent).
//
// This is the only client JS a cohort state adds. Which state a lesson is in,
// and whether a call is shown at all, is decided in Server Components.
const noopSubscribe = () => () => {};

const FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
};

export function LocalDateTime({ iso, locale }: { iso: string; locale: "en-GB" | "ru-RU" }) {
  const text = useSyncExternalStore(
    noopSubscribe,
    () => new Date(iso).toLocaleString(locale, FORMAT),
    () => new Date(iso).toLocaleString(locale, { ...FORMAT, timeZone: "UTC" }),
  );
  return <time dateTime={iso}>{text}</time>;
}
