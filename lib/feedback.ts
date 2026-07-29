// The feedback vocabulary: categories, length bounds, error codes, and the
// browser-context capture.
//
// Pure apart from one explicitly browser-guarded function, so the dialog, the
// route handler and any test can all import it — the lib/notificationPrefs.ts
// and lib/avatar.ts split, again. The bounds and category list below are
// MIRRORED in migration 026, which is where they are actually enforced; keep
// the two in step.

import { APP_VERSION } from "@/lib/appVersion";

export const FEEDBACK_ENDPOINT = "/api/feedback";

export const FEEDBACK_CATEGORIES = [
  {
    key: "bug",
    label: "Bug",
    description: "Something is broken or behaving wrongly.",
  },
  {
    key: "idea",
    label: "Idea",
    description: "Something you'd like the app to do.",
  },
  {
    key: "other",
    label: "Other",
    description: "Anything that doesn't fit the two above.",
  },
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]["key"];

export const FEEDBACK_CATEGORY_KEYS = FEEDBACK_CATEGORIES.map(c => c.key) as readonly string[];

/**
 * There is deliberately no "a question was wrong" category. question_reports
 * already handles that from inside the quiz, and it captures the question id
 * and the selected answer — context this form has no way to reconstruct.
 * Offering it here would produce reports that name no question.
 */

/** Long enough to be a sentence. "broken" is not a bug report. */
export const FEEDBACK_MIN_LENGTH = 10;
/** Long enough for a detailed repro, short enough not to be a file upload. */
export const FEEDBACK_MAX_LENGTH = 2000;

/** The states admin triage moves an item through. Users never see these. */
export const FEEDBACK_STATUSES = ["new", "triaged", "closed"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/**
 * Machine-readable failure reasons the route returns as `{ error: <code> }`.
 * The UI switches on these so it can say WHY rather than showing a generic
 * failure — "you've sent 5 in the last hour" is actionable, "something went
 * wrong" is not.
 */
export const FEEDBACK_ERRORS = {
  unauthorized: "unauthorized",
  invalidCategory: "invalid_category",
  /** The payload was malformed in some way the specific codes don't name. */
  invalidPayload: "invalid_payload",
  messageTooShort: "message_too_short",
  messageTooLong: "message_too_long",
  rateLimited: "rate_limited",
  serverError: "server_error",
} as const;

export type FeedbackErrorCode = (typeof FEEDBACK_ERRORS)[keyof typeof FEEDBACK_ERRORS];

export function asFeedbackCategory(value: unknown): FeedbackCategory | null {
  return typeof value === "string" && FEEDBACK_CATEGORY_KEYS.includes(value)
    ? (value as FeedbackCategory)
    : null;
}

/**
 * The one validation function, shared by the client (to disable the button and
 * show a live counter) and the route (to reject a bypassed client). Returns a
 * machine code plus the sentence to show, or null when the message is fine.
 *
 * Trims before measuring, matching the `feedback_message_length` CHECK.
 */
export function validateFeedbackMessage(
  message: string,
): { code: FeedbackErrorCode; reason: string } | null {
  const length = message.trim().length;
  if (length < FEEDBACK_MIN_LENGTH) {
    return {
      code: FEEDBACK_ERRORS.messageTooShort,
      reason: `Please write at least ${FEEDBACK_MIN_LENGTH} characters so we know what to look at.`,
    };
  }
  if (length > FEEDBACK_MAX_LENGTH) {
    return {
      code: FEEDBACK_ERRORS.messageTooLong,
      reason: `Please keep it under ${FEEDBACK_MAX_LENGTH} characters.`,
    };
  }
  return null;
}

/** The metadata columns, captured rather than asked for. All optional. */
export type FeedbackContext = {
  route?: string;
  userAgent?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  theme?: string;
  appVersion?: string;
};

/**
 * Reads the diagnostic context out of the browser.
 *
 * NONE of this is asked for and none of it is required: every field is
 * optional all the way down to the column definitions, because a missing
 * viewport must never cost us a message. Nothing here is personal beyond what
 * every HTTP request already carries — no session contents, no form values, no
 * page text.
 *
 * `route` is the field that matters most, and the reason the button opens a
 * dialog over the current page rather than navigating to one: by the time you
 * have navigated, the page the report is about is gone.
 *
 * Returns {} outside the browser rather than throwing, so a server render that
 * happens to reach this is a no-op.
 */
export function collectFeedbackContext(
  route: string,
  resolvedTheme?: string,
): FeedbackContext {
  if (typeof window === "undefined") return {};
  return {
    route: route.slice(0, 512),
    userAgent: window.navigator.userAgent.slice(0, 1024),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    theme: resolvedTheme,
    appVersion: APP_VERSION,
  };
}
