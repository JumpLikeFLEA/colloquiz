/**
 * The brand tagline, "английский с умом" (docs/decisions/0156 Decision 11).
 * Russian in both locales, as in the owner's English mockup. One string in a
 * module of its own: lib/alliengll/copy.ts re-exports it, but the landing
 * header and the sign-in screens' frame (client-reachable) import it from here,
 * because importing copy.ts into a client component ships the whole strings
 * object (measured in 0222: `/` 192.6 -> 194.2 KB, "Answer review" in a chunk
 * `/` loads). Moved out of app/(english)/landingCopy.ts, whose header forbids
 * importing it outside the landing.
 */
export const TAGLINE = "английский с умом";
