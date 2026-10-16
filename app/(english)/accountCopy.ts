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
  /** The link to the learner home at /my (PROG-002, docs/decisions/0120). */
  myCourses: string;
  /** The editor-only link to /studio (SHELL-021). Studio's own chrome is
   * English (docs/decisions/0109), and "Studio" is its name, so both
   * languages use it. */
  studio: string;
  /** The link to /my/messages, shown only while a teacher reply is unread
   * (TCH-004, docs/decisions/0151): "Messages (2)". */
  messages: string;
  /** The chip's accessible name when there are unread replies: "Unread messages: 2". */
  unreadLabel: string;
};

export const accountCopy: Record<SurfaceLang, AccountStrings> = {
  ru: {
    signedInAs: "Вы вошли как",
    signedIn: "Вы вошли в аккаунт",
    signOut: "Выйти",
    myCourses: "Мои курсы",
    studio: "Studio",
    messages: "Сообщения",
    unreadLabel: "Непрочитанные сообщения:",
  },
  en: {
    signedInAs: "Signed in as",
    signedIn: "You are signed in",
    signOut: "Sign out",
    myCourses: "My courses",
    studio: "Studio",
    messages: "Messages",
    unreadLabel: "Unread messages:",
  },
};
