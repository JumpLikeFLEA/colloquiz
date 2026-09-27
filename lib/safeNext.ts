/**
 * Resolves a caller-supplied `next` redirect target against `origin`, and
 * refuses anything that doesn't resolve same-origin. Found in ANON-004
 * pre-push review: `/auth/confirm` and `/auth/callback` both built their
 * redirect as `${origin}${next}` with `next` read straight off the request
 * (or, after ANON-004, unwrapped from inside `emailRedirectTo`) — no
 * validation at all. `next = "@evil.com"` makes that concatenation
 * `"http://site.com@evil.com"`, which the WHATWG URL parser reads as
 * userinfo `site.com` followed by host `evil.com` — a real open redirect,
 * not a hypothetical one (confirmed by parsing it). `//evil.com` and
 * `/\evil.com` are NOT exploitable through that specific concatenation
 * pattern (the fixed `origin` prefix keeps them as a same-origin path), but
 * this function doesn't special-case that — see docs/decisions/0068.
 *
 * Deliberately resolves with `new URL(next, origin)` rather than
 * pattern-matching the string for `//`, `@`, backslashes, control
 * characters, etc. A blocklist of shapes is always incomplete — this is
 * exactly the class of bug being fixed. Handing the string to the same URL
 * parser a browser uses, then checking the RESULT's origin, means the
 * question answered is "where would this actually navigate to," not "does
 * it look dangerous."
 */
export function safeNext(next: string, origin: string): string {
  let resolved: URL;
  try {
    resolved = new URL(next, origin);
  } catch {
    return "/";
  }
  if (resolved.origin !== origin) return "/";
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
