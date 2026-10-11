/**
 * SHELL-021 (docs/decisions/0109 Decision 4, entry point 3) — where a
 * sign-in lands, given the `next` it carried and whether the user can edit
 * at least one course.
 *
 * An editor whose `next` is the root ("/", which is also what an absent
 * `next` becomes on every sign-in path) lands on /studio. `/` counts because
 * the landing header's "Log in" sends `next=/` (app/(english)/
 * LandingHeader.tsx), the path the partner is most likely to use. Any
 * deeper `next` (a lesson, an invite, /app/...) wins, and a non-editor
 * lands exactly where `next` says, as before this card.
 *
 * Exact match on "/": `/?source=…` or `/#catalogue` are explicit targets on
 * the landing, not "no destination", so they are left alone.
 *
 * Pure: the caller resolves `next` (authDest / safeNext) and `isEditor`
 * (lib/studioEditor.ts) and passes both in.
 */
export const STUDIO_HOME = "/studio";

export function postSignInDest(next: string, isEditor: boolean): string {
  return isEditor && next === "/" ? STUDIO_HOME : next;
}

/** True when `postSignInDest` could change `next`, i.e. when it is worth
 * asking whether the user is an editor at all. Lets the password sign-in
 * skip the server hop for every deeper `next`. */
export function signInDestDependsOnRole(next: string): boolean {
  return next === "/";
}
