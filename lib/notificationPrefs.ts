// The notification preference vocabulary.
//
// Pure and dependency-free so the client component, the server page and the
// tests can all import it — same reason lib/historyFilters.ts is split out of
// lib/history.ts.
//
// The event → notification-type grouping described here is IMPLEMENTED in SQL,
// by notification_pref_key() in migration 024. That function is the source of
// truth; the `covers` list below exists so the UI can say what a row actually
// silences, and must be kept in step with it.

export const NOTIFICATION_EVENTS = [
  {
    key: "duel_challenge",
    label: "Duel challenges",
    description: "When someone challenges you, and when a challenge you sent is accepted.",
    covers: ["duel_challenge", "duel_accepted"],
  },
  {
    key: "duel_result",
    label: "Duel results",
    description: "When a duel finishes, or is declined, withdrawn, or left to expire.",
    covers: ["duel_resolved", "duel_declined", "duel_cancelled", "duel_expired"],
  },
  {
    key: "group_activity",
    label: "Group members joining",
    description: "When someone accepts an invite link to a group you own.",
    covers: ["group_member_joined"],
  },
  {
    key: "achievement",
    label: "Achievements unlocked",
    description: "When you earn an achievement or hit a streak milestone.",
    covers: ["achievement_unlocked"],
  },
  {
    key: "quiz_received",
    label: "Quizzes sent to me",
    description: "When someone shares a quiz with you, or a tutor assigns you one.",
    covers: ["quiz_shared", "assignment_created"],
  },
] as const;

export type NotificationEventKey = (typeof NOTIFICATION_EVENTS)[number]["key"];

/** What every event is set to before the user has touched anything. */
export const DEFAULT_IN_APP = true;

/** A stored row. Absent rows are not stored — see prefsFromRows. */
export type NotificationPrefRow = {
  event: string;
  in_app: boolean;
};

/**
 * Rows → a value for every event.
 *
 * Preferences are stored sparsely: a row exists only for an event the user has
 * changed, and absence means the default. So a brand-new account reads back
 * zero rows and still gets a complete, correct set here. Unknown event keys in
 * the data (a preference retired in a later migration) are ignored rather than
 * widening the returned shape.
 */
export function prefsFromRows(
  rows: readonly NotificationPrefRow[] | null | undefined,
): Record<NotificationEventKey, boolean> {
  const stored = new Map((rows ?? []).map(r => [r.event, r.in_app]));
  const out = {} as Record<NotificationEventKey, boolean>;
  for (const e of NOTIFICATION_EVENTS) {
    out[e.key] = stored.get(e.key) ?? DEFAULT_IN_APP;
  }
  return out;
}

/**
 * Why the email column is disabled.
 *
 * Stated as a fact about the app, not as a vague "coming soon": the app sends
 * no transactional email for these events, so toggles here would control
 * nothing. Delete this and enable the column when delivery exists.
 */
export const EMAIL_UNAVAILABLE_NOTE =
  "Email delivery isn’t built yet — this app sends no mail for these events, so these " +
  "switches would control nothing. They’ll turn on here once it does.";
