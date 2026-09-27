/**
 * OPS-008 — coarse acquisition-channel classification for the four funnel
 * events (docs/decisions/0069). `classifyFunnelSource` is pure and DOM-free;
 * `resolveFunnelSource` is the stateful half, taking every browser global it
 * touches as an injected, narrowly-typed parameter (same style as
 * `lib/pendingClaims.ts`'s `extractClientIp(headers: Pick<Headers, "get">)`)
 * so it stays unit-testable without jsdom.
 */

export type FunnelSource = "instagram" | "telegram" | "direct";

const SESSION_STORAGE_KEY = "colloquiz_funnel_source";

/**
 * utm_source wins over referrer when both are present — a promoted link's
 * own tag is more reliable than the hosting platform's referrer header,
 * which an in-app browser (Instagram's, Telegram's) often strips or
 * rewrites anyway. Falls back to referrer hostname, then "direct".
 */
export function classifyFunnelSource(utmSource: string | null, referrer: string): FunnelSource {
  const normalizedUtm = utmSource?.trim().toLowerCase() ?? "";
  if (normalizedUtm.includes("instagram")) return "instagram";
  if (normalizedUtm.includes("telegram")) return "telegram";

  let hostname = "";
  try {
    hostname = new URL(referrer).hostname.toLowerCase();
  } catch {
    hostname = "";
  }
  if (hostname.includes("instagram.com")) return "instagram";
  if (hostname === "t.me" || hostname.endsWith(".t.me") || hostname.includes("telegram.")) return "telegram";

  return "direct";
}

export interface FunnelSourceEnv {
  sessionStorage: Pick<Storage, "getItem" | "setItem">;
  /** Only the two privacy signals this reads — never the whole `Navigator`. */
  navigator: { doNotTrack?: string | null; globalPrivacyControl?: boolean };
  location: Pick<Location, "search">;
  referrer: string;
}

/**
 * Shared opt-out check — Global Privacy Control or Do Not Track. Exported so
 * `EntryViewBeacon.tsx` can skip its OWN sessionStorage write (the "landing
 * already fired" flag, unrelated to source classification) under the same
 * signal `resolveFunnelSource` already honors for the source cache, per
 * docs/decisions/0069: an opted-out visitor leaves no trace of the check at
 * all, not just no recorded channel.
 */
export function isFunnelOptedOut(navigator: { doNotTrack?: string | null; globalPrivacyControl?: boolean }): boolean {
  return navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true;
}

/** Exported for the server-side signup callers (/auth/confirm, /auth/callback)
 * to narrow an untrusted query-string `source` value before handing it to
 * `recordServerFunnelEvent` — the RPC itself also rejects a bad value
 * (migration 051), this just gives those routes a typed value to pass. */
export function isFunnelSource(value: string): value is FunnelSource {
  return value === "instagram" || value === "telegram" || value === "direct";
}

/**
 * The per-tab source a visitor is attributed to, or `null` when they've
 * opted out via Global Privacy Control / Do Not Track — in which case
 * nothing is read from or written to sessionStorage either (docs/decisions/
 * 0069: an opted-out visitor leaves no trace of the check itself).
 *
 * Classified once per tab (sessionStorage-cached) so a learner navigating
 * from the course page into a lesson keeps the SAME source that got them
 * there, rather than being reclassified against `document.referrer` — which,
 * after the first internal navigation, would just read this site's own URL.
 */
export function resolveFunnelSource(env: FunnelSourceEnv): FunnelSource | null {
  if (isFunnelOptedOut(env.navigator)) {
    return null;
  }

  const cached = env.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (cached && isFunnelSource(cached)) return cached;

  const utmSource = new URLSearchParams(env.location.search).get("utm_source");
  const classified = classifyFunnelSource(utmSource, env.referrer);
  env.sessionStorage.setItem(SESSION_STORAGE_KEY, classified);
  return classified;
}

/**
 * `resolveFunnelSource` against the real browser globals. Exported so
 * `RegistrationOffer.tsx` can read the current tab's classification to
 * thread into a redirect URL (signup fires server-side — see
 * `fireFunnelEvent`'s doc comment), not only to fire an event directly.
 */
export function getCurrentFunnelSource(): FunnelSource | null {
  return resolveFunnelSource({
    sessionStorage: window.sessionStorage,
    navigator: {
      doNotTrack: navigator.doNotTrack,
      globalPrivacyControl: (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl,
    },
    location: window.location,
    referrer: document.referrer,
  });
}

export type FunnelEventType = "landing_view" | "lesson_start" | "lesson_complete";

/**
 * Fire-and-forget POST to /api/events for the three CLIENT-fired events
 * (signup fires server-side only — docs/decisions/0069). `keepalive: true`
 * so the request survives a navigation started right after (e.g. clicking
 * "next lesson" the instant lesson_complete fires). Errors are swallowed:
 * this must never surface to or block the learner, same posture as
 * `LessonPlayer`'s own `recordSignedInAttempt`.
 */
export function fireFunnelEvent(event: FunnelEventType, path: string): void {
  try {
    const source = getCurrentFunnelSource();
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ event, source, path }),
    }).catch((err) => console.error("failed to record funnel event", err));
  } catch (err) {
    console.error("failed to record funnel event", err);
  }
}
