import { PAPER_LINK_INLINE_CLASS } from "./surfaceClasses";

/** The three parts of the "Not you? [Sign out] and sign in…" line. */
export type SignOutLineCopy = { before: string; signOut: string; after: string };

/**
 * "Not you? [Sign out] and sign in with the right account." under the join
 * and invite pages' action (SHELL-040, docs/decisions/0252). Its sentence used
 * to send the learner to the account menu, which is gone; the button now signs
 * out in place: a plain form POST to /auth/sign-out with `next` = this page,
 * which safeNext keeps, so the learner comes back to the same link signed out
 * and sees its sign-in button. Zero client JS.
 *
 * The form wraps the sentence (a form inside a <p> is invalid HTML), and the
 * button is styled as an inline link, since it sits inside running text.
 */
export function SignOutLine({ copy, next }: { copy: SignOutLineCopy; next: string }) {
  return (
    <form method="post" action="/auth/sign-out" className="max-w-sm text-xs text-muted-foreground">
      <input type="hidden" name="next" value={next} />
      {copy.before}{" "}
      <button type="submit" className={`cursor-pointer ${PAPER_LINK_INLINE_CLASS}`}>
        {copy.signOut}
      </button>{" "}
      {copy.after}
    </form>
  );
}
