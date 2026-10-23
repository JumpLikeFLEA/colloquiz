// COH-012 (docs/decisions/0197) — the Telegram message that says a week of a cohort
// course has opened (docs/decisions/0140, event 1, option A: a daily cron). Which
// (enrolment, week) is due, and the sent log that keeps a second cron run from sending
// it again, are decided in SQL (telegram_week_ping_claim, migration 099); this module
// words the text, builds the link and drives the claim and the sends. Effects are
// injected so vitest covers every branch. It never throws: the cron route reports what
// happened, and a Telegram failure for one learner must not stop the next.
//
// The text names the course by its authored title: 0140's wording does, and the privacy
// policy lists "course and lesson titles" among what Telegram receives. Wording pending
// partner review.

import { createAdminClient } from "../supabase/admin";
import { SITE_URL } from "../site";
import { sendReminder, type SendOutcome } from "./send";
import { parseTelegramLang, type TelegramLang } from "./messages";

/** One row of telegram_week_ping_claim: a week that opened, for one enrolment. */
export type WeekClaim = {
  enrolmentId: string;
  week: number;
  recipientId: string;
  lang: TelegramLang;
  courseSlug: string;
  courseTitle: string;
};

/** 0140's draft wording; week 1 is "the course has started". */
const TEXT = {
  started: {
    en: (course: string, link: string) => `“${course}” has started: ${link}`,
    ru: (course: string, link: string) => `Курс «${course}» начался: ${link}`,
  },
  opened: {
    en: (week: number, course: string, link: string) => `Week ${week} of “${course}” is open: ${link}`,
    ru: (week: number, course: string, link: string) => `Неделя ${week} курса «${course}» открыта: ${link}`,
  },
} as const;

/** The course page, where the open lessons are listed. */
export function weekLink(claim: Pick<WeekClaim, "courseSlug">, origin: string): string {
  return `${origin}/courses/${encodeURIComponent(claim.courseSlug)}`;
}

export function weekText(claim: WeekClaim, origin: string): string {
  const link = weekLink(claim, origin);
  return claim.week === 1
    ? TEXT.started[claim.lang](claim.courseTitle, link)
    : TEXT.opened[claim.lang](claim.week, claim.courseTitle, link);
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** Reads one claim row; null unless every field the text needs is present. */
export function readWeekClaim(row: unknown): WeekClaim | null {
  if (!row || typeof row !== "object") return null;
  const d = row as Record<string, unknown>;
  const enrolmentId = str(d.enrolment_id);
  const recipientId = str(d.recipient_id);
  const courseSlug = str(d.course_slug);
  const courseTitle = str(d.course_title);
  if (!enrolmentId || !recipientId || !courseSlug || !courseTitle) return null;
  if (typeof d.week !== "number" || !Number.isInteger(d.week) || d.week < 1) return null;
  return { enrolmentId, week: d.week, recipientId, lang: parseTelegramLang(d.lang), courseSlug, courseTitle };
}

export type WeekPingDeps = {
  /** telegram_week_ping_claim (service role): the raw rows it answers. */
  claim: (limit: number) => Promise<unknown>;
  send: (userId: string, text: string) => Promise<SendOutcome>;
  origin: string;
};

export type WeekPingSummary = {
  /** Rows the claim returned (each is logged in SQL before it is sent). */
  claimed: number;
  sent: number;
  /** A send that came back blocked, failed or not_linked, or that threw. */
  notSent: number;
  /** Claimed rows missing a field the text needs. */
  unreadable: number;
  /** The claim itself failed: nothing was logged or sent. */
  claimFailed: boolean;
};

/** Max rows one cron run claims; what is left is still due on the next run (SQL's 3-day window). */
export const WEEK_PING_BATCH = 100;

/** One cron run. Never throws. */
export async function runWeekPings(deps: WeekPingDeps, limit: number = WEEK_PING_BATCH): Promise<WeekPingSummary> {
  const summary: WeekPingSummary = { claimed: 0, sent: 0, notSent: 0, unreadable: 0, claimFailed: false };
  let rows: unknown[];
  try {
    const data = await deps.claim(limit);
    rows = Array.isArray(data) ? data : [];
  } catch {
    summary.claimFailed = true;
    return summary;
  }
  summary.claimed = rows.length;
  for (const row of rows) {
    const claim = readWeekClaim(row);
    if (!claim) {
      summary.unreadable++;
      continue;
    }
    try {
      const outcome = await deps.send(claim.recipientId, weekText(claim, deps.origin));
      if (outcome === "sent") summary.sent++;
      else summary.notSent++;
    } catch {
      summary.notSent++;
    }
  }
  return summary;
}

/** The production wiring: the service-role client, the bot sender and the site origin. */
export function sendWeekPings(): Promise<WeekPingSummary> {
  return runWeekPings({
    claim: async (limit) => {
      const { data, error } = await createAdminClient().rpc("telegram_week_ping_claim", { p_limit: limit });
      if (error) throw error;
      return data;
    },
    send: sendReminder,
    origin: SITE_URL,
  });
}
