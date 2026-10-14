import type { OAuthProvider } from "./authRedirect";

/**
 * ANON-004 — a pure user-agent check for the two in-app browsers
 * docs/handoff.md names as how a learner arrives (Instagram reel, Alliengll
 * Telegram channel post): Google rejects OAuth inside an embedded webview,
 * so the registration offer hides its OAuth buttons rather than let the
 * learner hit a dead end. Not verified against a real device by this card —
 * that pass is OPS-007's, and this list is the one place to extend if it
 * finds a UA shape this substring check misses (see docs/decisions/0068).
 */
const IN_APP_BROWSER_MARKERS = ["Instagram", "Telegram"];

export function isInAppBrowser(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return IN_APP_BROWSER_MARKERS.some((marker) => userAgent.includes(marker));
}

/**
 * ANON-012 — the providers a device pass has proven to complete sign-in
 * inside these in-app browsers. Empty: Google is known not to (above),
 * Discord was never tested, and Telegram's pass runs on production after
 * this card ships (docs/decisions/0098 Decision 1). A provider joins this
 * list only with that pass's printed result behind it.
 */
const WORKS_IN_IN_APP_BROWSER: readonly OAuthProvider[] = [];

/** Whether to offer `provider`'s button to a browser with this user agent. */
export function isOAuthProviderAvailable(provider: OAuthProvider, userAgent: string | null | undefined): boolean {
  return !isInAppBrowser(userAgent) || WORKS_IN_IN_APP_BROWSER.includes(provider);
}
