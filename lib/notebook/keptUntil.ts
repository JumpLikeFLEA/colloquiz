import type { NotebookTake } from "./types";

/** `timestamptz + INTERVAL '6 months'` in UTC, the way Postgres does it: the day is cut to the
 * target month's last one (31 August gives 28 or 29 February). Null for an unreadable date. */
export function plusSixMonths(iso: string): string | null {
  const from = new Date(iso);
  if (Number.isNaN(from.getTime())) return null;
  const to = new Date(from);
  to.setUTCDate(1);
  to.setUTCMonth(from.getUTCMonth() + 6);
  const last = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 0)).getUTCDate();
  to.setUTCDate(Math.min(from.getUTCDate(), last));
  return to.toISOString();
}

/** When the audio falls due for deletion (094, `voice_purge_due`): 6 months after a self-paced take
 * was sent, 6 months after a cohort take's run ends. Null when the run's end could not be read: a
 * cohort take never falls back to its own date, which would be too early. */
export function keptUntil(take: Pick<NotebookTake, "enrolmentId" | "runEndsAt" | "submittedAt">): string | null {
  if (take.enrolmentId === null) return plusSixMonths(take.submittedAt);
  return take.runEndsAt === null ? null : plusSixMonths(take.runEndsAt);
}
