/**
 * COH-004 — pure helpers for a cohort course's public page and lesson page
 * (docs/decisions/0108). Import-free, so the "unit" vitest project can load
 * it (docs/decisions/0004).
 *
 * Nothing here decides whether a lesson opens or who may see a call. A
 * lesson's state and `opensAt` come from `course_lesson_states` (058,
 * `_lesson_access_at`), and the calls from `course_calls` (058), which
 * returns rows only to an editor and to a non-revoked `extended` enrolee.
 * These functions only arrange what SQL already returned. Where they filter,
 * they only ever drop rows, never add one (0108 Decision 2).
 */

export type WeekGroupLesson = { week: number | null; state: string; opensAt: string | null };

export type WeekGroup<T> = {
  /** null: the lessons with no week (a cohort course's open taster). */
  week: number | null;
  /** The one unlock moment every lesson in the group shares, when they all
   * are `scheduled` for the same instant; the group header then carries the
   * date and the rows don't repeat it. null otherwise. */
  opensAt: string | null;
  /** In input order, each with its 1-based place in the WHOLE input list,
   * so a row's number matches the lesson page's "Lesson N of M". */
  lessons: (T & { position: number })[];
};

/**
 * Lessons grouped by `week`: the weekless group first, then weeks
 * ascending. Input order (ordinal, then slug) is kept inside each group.
 */
export function groupLessonsByWeek<T extends WeekGroupLesson>(lessons: readonly T[]): WeekGroup<T>[] {
  const byWeek = new Map<number | null, (T & { position: number })[]>();
  lessons.forEach((lesson, i) => {
    const list = byWeek.get(lesson.week) ?? [];
    list.push({ ...lesson, position: i + 1 });
    byWeek.set(lesson.week, list);
  });
  const weeks = [...byWeek.keys()].sort((a, b) => (a === null ? -1 : b === null ? 1 : a - b));
  return weeks.map((week) => {
    const group = byWeek.get(week)!;
    const first = group[0].opensAt;
    const shared =
      first !== null && group.every((l) => l.state === "scheduled" && l.opensAt === first) ? first : null;
    return { week, opensAt: shared, lessons: group };
  });
}

/** How long after its start a call still offers its Join link (0108 Decision 1). */
export const CALL_JOINABLE_MINUTES = 120;

export type RunCall = { id: string; runId: string; startsAt: string; meetUrl: string; title: string | null };

/**
 * Upcoming calls first, soonest first ("next one first"); then past calls,
 * most recent first. A call stays upcoming, with its Join link, for
 * `CALL_JOINABLE_MINUTES` after it starts, so a learner who is five minutes
 * late can still join.
 */
export function splitCalls(
  calls: readonly RunCall[],
  now: Date,
): { upcoming: RunCall[]; past: RunCall[] } {
  const cutoff = now.getTime() - CALL_JOINABLE_MINUTES * 60_000;
  const upcoming = calls
    .filter((c) => Date.parse(c.startsAt) > cutoff)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const past = calls
    .filter((c) => Date.parse(c.startsAt) <= cutoff)
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  return { upcoming, past };
}

export type PublicRun = { id: string; title: string | null; startsAt: string };

/** The earliest run that has not started yet; null when there is none. */
export function nextUpcomingRun<T extends PublicRun>(runs: readonly T[], now: Date): T | null {
  const t = now.getTime();
  return (
    [...runs].filter((r) => Date.parse(r.startsAt) > t).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0] ??
    null
  );
}

export type ActiveEnrolment = { runId: string; tier: "basic" | "extended" };

export type CohortAudience =
  /** At least one active extended enrolment: sees that run's calls. */
  | { kind: "extended"; callRunIds: ReadonlySet<string> }
  /** Only basic enrolments: nothing about calls (COH-004 acceptance). */
  | { kind: "basic" }
  /** No enrolment and something still needs an entitlement: the visitor
   * preview (0093 "Non-enrolled visitor"). */
  | { kind: "visitor" }
  /** No enrolment, and nothing needs one (an editor, a comp grant): no
   * cohort block at all. */
  | { kind: "none" };

/**
 * Which cohort block the page shows. `enrolments` are the caller's own
 * NON-REVOKED rows for this course's runs; `lessons` carry SQL states.
 */
export function cohortAudience(
  enrolments: readonly ActiveEnrolment[],
  lessons: readonly { state: string }[],
): CohortAudience {
  const extended = enrolments.filter((e) => e.tier === "extended");
  if (extended.length > 0) return { kind: "extended", callRunIds: new Set(extended.map((e) => e.runId)) };
  if (enrolments.length > 0) return { kind: "basic" };
  if (lessons.some((l) => l.state === "needs_entitlement")) return { kind: "visitor" };
  return { kind: "none" };
}

/**
 * The calls the page lists for an extended learner: the `course_calls` rows
 * of the runs they are enrolled in as extended. For a learner this is every
 * row SQL returned; it only drops rows for a caller who is also an editor
 * (who gets every run's calls from SQL), so a learner's page never shows
 * another run's calls (0108 Decision 2).
 */
export function callsForAudience(calls: readonly RunCall[], audience: CohortAudience): RunCall[] {
  if (audience.kind !== "extended") return [];
  return calls.filter((c) => audience.callRunIds.has(c.runId));
}
