/**
 * COH-003 — the claim page's strings (docs/decisions/0107). English with no
 * toggle, as the card says, and like the rest of the learner's path into a
 * lesson (docs/decisions/0080 Decision 5).
 *
 * Its own module, imported only by the Server Component page, so it ships
 * to no client bundle (the signInCopy.ts / accountCopy.ts precedent).
 *
 * New copy, pending owner/partner review.
 */
export const inviteCopy = {
  metaTitle: "Your invite",
  eyebrow: "Invite",
  tier: { basic: "Basic", extended: "Extended, with live calls" },
  pending: {
    title: "You’re invited to join this course",
    signedOutBody: "Sign in or create an account to join. Use the account you want to study with.",
    signedOutCta: "Sign in or create an account",
    /** Followed by the learner's email. */
    joiningAs: "You’ll join as",
    joiningSignedIn: "You’ll join with the account you’re signed in to.",
    otherAccount: "Not you? Sign out from the menu at the top and sign in with the right account.",
    join: "Join the course",
  },
  alreadyEnrolled: {
    title: "You’re already in this course",
    body: "This account has already joined this run, so the invite wasn’t used. You can pass it back to the person who sent it.",
  },
  claimedByYou: {
    title: "You’ve joined this course",
    body: "This invite is already linked to your account.",
  },
  used: {
    title: "This invite has already been used",
    body: "Each invite link works once. If it was meant for you, ask the person who sent it for a new one.",
  },
  expired: {
    title: "This invite has expired",
    body: "Ask the person who sent it for a new link.",
  },
  revoked: {
    title: "This invite was cancelled",
    body: "If you think this is a mistake, ask the person who sent it.",
  },
  notFound: {
    title: "This invite link isn’t valid",
    body: "Check that you opened the whole link, or ask the person who sent it for a new one.",
  },
  goToCourse: "Go to the course",
  home: "Go to the home page",
} as const;
