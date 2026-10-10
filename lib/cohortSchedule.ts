/**
 * AUTH-010 — date helpers for the cohort editor (runs and calls, migration
 * 058, docs/decisions/0093 / 0105). Import-free, so the "unit" vitest project
 * can load it (docs/decisions/0004).
 *
 * Nothing here decides whether a learner may open a lesson: that is
 * `_lesson_access_at` in SQL (docs/handoff.md, "Entitlement is decided in one
 * place"). `runPhase` only chooses which editor controls to SHOW; every RPC
 * re-checks the same condition and refuses on its own (docs/decisions/0106
 * Decision 2).
 */

export type RunPhase = "upcoming" | "in_progress" | "ended";

/** 058 header §4: "in progress = starts_at <= now() < ends_at". */
export function runPhase(run: { startsAt: string; endsAt: string }, now: Date): RunPhase {
  const t = now.getTime();
  if (t < Date.parse(run.startsAt)) return "upcoming";
  if (t < Date.parse(run.endsAt)) return "in_progress";
  return "ended";
}

/** A `<input type="datetime-local">` value: "YYYY-MM-DDTHH:mm", wall clock. */
const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function isLocalDateTime(value: string): boolean {
  return LOCAL_DATETIME.test(value);
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/**
 * `count` wall-clock times, one week apart, starting at `first`. Steps the
 * CALENDAR date, never adds 7×24h: a 19:00 call stays at 19:00 across a
 * daylight-saving change (docs/decisions/0106 Decision 4). Date.UTC is used
 * only as a calendar (month and year rollover); no timezone is involved.
 */
export function weeklyRepeats(first: string, count: number): string[] {
  const m = LOCAL_DATETIME.exec(first);
  if (!m || !Number.isInteger(count) || count < 1) return [];
  const [, y, mo, d, h, mi] = m;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const day = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d) + 7 * i));
    out.push(
      `${pad(day.getUTCFullYear(), 4)}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}T${h}:${mi}`,
    );
  }
  return out;
}

/** An instant as the editor's wall clock, for a datetime-local input. */
export function toLocalDateTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

/**
 * The editor's wall clock back to an instant (ISO, UTC). `new Date(y, m, …)`
 * reads the fields in the runtime's local zone, the same zone the input was
 * filled in. null for anything that isn't a datetime-local value.
 */
export function fromLocalDateTime(value: string): string | null {
  const m = LOCAL_DATETIME.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const date = new Date(y, mo - 1, d, h, mi);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Upper bound of the "repeat weekly ×N" helper. */
export const MAX_WEEKLY_REPEATS = 12;
