import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";

/**
 * The account pill's strings (SHELL-040, docs/decisions/0252), in both
 * languages because each English page picks its own: the landing and the
 * course page follow the EN/RU toggle, the lesson page is always English
 * (docs/decisions/0080).
 *
 * Imported only by Server Components (AccountPill and the pages that render
 * it), so neither language reaches a client bundle; keep it out of Client
 * Components (docs/decisions/0079, "Budget").
 */
type AccountStrings = {
  /** The pill's visible label and the name of the place it opens (/my). */
  label: string;
  /** The tooltip, before the email: "Signed in as gleb@…". */
  signedInAs: string;
  /** The tooltip when the session carries no email or username. */
  signedIn: string;
  /** Added to the accessible name while a reply is unread: "Unread messages: 2". */
  unreadLabel: string;
};

export const accountCopy: Record<SurfaceLang, AccountStrings> = {
  ru: {
    label: "Кабинет",
    signedInAs: "Вы вошли как",
    signedIn: "Вы вошли в аккаунт",
    unreadLabel: "Непрочитанные сообщения:",
  },
  en: {
    label: "My learning",
    signedInAs: "Signed in as",
    signedIn: "You are signed in",
    unreadLabel: "Unread messages:",
  },
};
