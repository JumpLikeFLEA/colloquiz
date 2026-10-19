import { isEnglishSurfaceEntry } from "./authRedirect";

const NOTICE_MESSAGES: Record<string, string> = {
  confirmed_sign_in: "Your email has been confirmed. Please sign in with your password.",
  account_deleted: "Your account has been closed and your personal details erased. Thanks for using Colloquiz.",
};

/**
 * The English sign-in entry (a `next` outside /app, which shows the Alina
 * Cher panel, docs/decisions/0135) gets the same notice without the Colloquiz
 * name: `/my/settings` sends a deleted account to
 * `/login?next=/&notice=account_deleted` (docs/decisions/0181 Decision 6).
 */
const ENGLISH_ENTRY_NOTICES: Record<string, string> = {
  account_deleted: "Your account has been closed and your personal details erased.",
};

/**
 * The notice /login shows for `?notice=`, or null for an unknown one. Own
 * keys only: `?notice=toString` must not find Object.prototype's.
 */
export function loginNotice(notice: string | undefined, next: string | undefined): string | null {
  if (!notice) return null;
  if (isEnglishSurfaceEntry(next) && Object.hasOwn(ENGLISH_ENTRY_NOTICES, notice)) return ENGLISH_ENTRY_NOTICES[notice];
  return Object.hasOwn(NOTICE_MESSAGES, notice) ? NOTICE_MESSAGES[notice] : null;
}
