/**
 * ANON-011 — the sign-in screen's strings (docs/decisions/0104). English,
 * like the rest of the lesson chrome (docs/decisions/0080 Decision 5).
 *
 * Its own module, not `lib/alliengll/copy.ts`: copy.ts is imported by the
 * client `LessonPlayer`, so every string added there ships to every open
 * lesson. This file is imported only by the Server Component
 * `LessonUnavailable`, so it ships to no client bundle (the accountCopy.ts /
 * errorCopy.ts precedent, docs/decisions/0079 "Budget").
 *
 * New copy, pending owner/partner review.
 */
export const signInCopy = {
  title: "Sign in to open this lesson",
  body: "It’s free. All you need is an account.",
  cta: "Sign in or create an account",
  /** Followed by the open lesson's title, as a link. */
  openLessonLead: "Or start with an open lesson:",
  /** A teaser video's facade: a link out, not an in-place embed (0104). */
  watchVideo: "Watch on YouTube",
} as const;

/**
 * COH-004 — a cohort lesson whose week hasn't opened yet
 * (docs/decisions/0108). English lesson chrome, same reasons as above.
 * New copy, pending owner/partner review.
 */
export const scheduledCopy = {
  title: "This lesson isn’t open yet",
  /** Followed by the unlock moment in the viewer's local time. */
  opensOn: "It opens on",
} as const;
