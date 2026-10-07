import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";

/**
 * The account menu's strings (SHELL-019, docs/decisions/0086), in both
 * languages because the menu sits on all three English pages and each page
 * picks its own language: the landing and the course page follow the EN/RU
 * toggle, the lesson page is always English (docs/decisions/0080).
 *
 * Imported only by Server Components (AccountMenu and the pages that render
 * it), so neither language reaches a client bundle; keep it out of Client
 * Components (docs/decisions/0079, "Budget").
 *
 * New copy, pending owner/partner review.
 */
type AccountStrings = {
  /** Before the email: "Signed in as gleb@…". */
  signedInAs: string;
  /** When the session carries no email. */
  signedIn: string;
  signOut: string;
};

export const accountCopy: Record<SurfaceLang, AccountStrings> = {
  ru: {
    signedInAs: "Вы вошли как",
    signedIn: "Вы вошли в аккаунт",
    signOut: "Выйти",
  },
  en: {
    signedInAs: "Signed in as",
    signedIn: "You are signed in",
    signOut: "Sign out",
  },
};
