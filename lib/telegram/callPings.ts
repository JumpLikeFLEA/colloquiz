// COH-013 (docs/decisions/0198) — the Telegram digest of an extended enrolee's calls
// that start soon (docs/decisions/0140, event 4, option A: a daily cron). Which
// (enrolment, call) is due, and the sent log that keeps a second cron run from
// announcing a call again, are decided in SQL (telegram_call_ping_claim, migration 100,
// restating 058's course_calls rule); this module words the text, puts the times in the
// zone saved at link time and drives the claim and the sends. Effects are injected so
// vitest covers every branch. It never throws: the cron route reports what happened,
// and a Telegram failure for one learner must not stop the next.
//
// The cron fires once a day inside its hour (0140), so no text says how long before the
// call it is sent: it gives the call's date and time and nothing else about timing.
// The text names the course and the call by their authored titles and carries the join
// link; the privacy policy lists "course and lesson titles and a link" among what
// Telegram receives. Wording pending partner review.

import { createAdminClient } from "../supabase/admin";
import { sendReminder, type SendOutcome } from "./send";
import { parseTelegramLang, type TelegramLang } from "./messages";

/** One row of telegram_call_ping_claim: a call, for one enrolment. */
export type CallClaim = {
  enrolmentId: string;
  callId: string;
  recipientId: string;
  lang: TelegramLang;
  /** The IANA zone saved at link time, or null (the text then says UTC). */
  timeZone: string | null;
  courseSlug: string;
  courseTitle: string;
  startsAt: Date;
  callTitle: string | null;
  meetUrl: string;
};

const HEADER = { en: "Calls coming up:", ru: "Ближайшие созвоны:" } as const;

/** Longest authored title the text carries; the rest would only push the link out of sight. */
const MAX_TITLE = 80;
/** Calls in one message; a learner with more gets a second message. Far under Telegram's 4096 characters. */
export const CALLS_PER_MESSAGE = 10;

const clip = (s: string): string => (s.length > MAX_TITLE ? `${s.slice(0, MAX_TITLE - 1)}…` : s);

/**
 * "Tue, 28 Oct, 15:00 GMT+1" in the saved zone, "… UTC" with none (or one this runtime
 * does not know). Locale follows the saved language.
 */
export function callWhen(startsAt: Date, lang: TelegramLang, timeZone: string | null): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  };
  const locale = lang === "ru" ? "ru-RU" : "en-GB";
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: timeZone ?? "UTC" }).format(startsAt);
  } catch {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(startsAt);
  }
}

/** One call: when, the course (and the call's own title), and the join link on the next line. */
export function callLine(claim: CallClaim): string {
  const what = clip(claim.courseTitle) + (claim.callTitle ? ` · ${clip(claim.callTitle)}` : "");
  return `• ${callWhen(claim.startsAt, claim.lang, claim.timeZone)} — ${what}\n${claim.meetUrl}`;
}

/** The digest for one learner's calls (all in their language and zone). */
export function callDigestText(claims: CallClaim[]): string {
  return [HEADER[claims[0].lang], ...claims.map(callLine)].join("\n\n");
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** Reads one claim row; null unless every field the text needs is present. */
export function readCallClaim(row: unknown): CallClaim | null {
  if (!row || typeof row !== "object") return null;
  const d = row as Record<string, unknown>;
  const enrolmentId = str(d.enrolment_id);
  const callId = str(d.call_id);
  const recipientId = str(d.recipient_id);
  const courseSlug = str(d.course_slug);
  const courseTitle = str(d.course_title);
  const meetUrl = str(d.meet_url);
  const startsAtRaw = str(d.call_starts_at);
  if (!enrolmentId || !callId || !recipientId || !courseSlug || !courseTitle || !meetUrl || !startsAtRaw) return null;
  const startsAt = new Date(startsAtRaw);
  if (Number.isNaN(startsAt.getTime())) return null;
  return {
    enrolmentId,
    callId,
    recipientId,
    lang: parseTelegramLang(d.lang),
    timeZone: str(d.time_zone),
    courseSlug,
    courseTitle,
    startsAt,
    callTitle: str(d.call_title),
    meetUrl,
  };
}

export type CallPingDeps = {
  /** telegram_call_ping_claim (service role): the raw rows it answers. */
  claim: (limit: number) => Promise<unknown>;
  send: (userId: string, text: string) => Promise<SendOutcome>;
};

export type CallPingSummary = {
  /** Rows the claim returned (each is logged in SQL before it is sent). */
  claimed: number;
  /** Messages built: one per learner, more only past CALLS_PER_MESSAGE calls. */
  messages: number;
  sent: number;
  /** A send that came back blocked, failed or not_linked, or that threw. */
  notSent: number;
  /** Claimed rows missing a field the text needs. */
  unreadable: number;
  /** The claim itself failed: nothing was logged or sent. */
  claimFailed: boolean;
};

/** Max rows one cron run claims; what is left is still due on the next run while its call is ahead. */
export const CALL_PING_BATCH = 100;

/** One cron run. Never throws. */
export async function runCallPings(deps: CallPingDeps, limit: number = CALL_PING_BATCH): Promise<CallPingSummary> {
  const summary: CallPingSummary = { claimed: 0, messages: 0, sent: 0, notSent: 0, unreadable: 0, claimFailed: false };
  let rows: unknown[];
  try {
    const data = await deps.claim(limit);
    rows = Array.isArray(data) ? data : [];
  } catch {
    summary.claimFailed = true;
    return summary;
  }
  summary.claimed = rows.length;

  // One digest per learner, in the order SQL returned them (by learner, then start time).
  const byRecipient = new Map<string, CallClaim[]>();
  for (const row of rows) {
    const claim = readCallClaim(row);
    if (!claim) {
      summary.unreadable++;
      continue;
    }
    const list = byRecipient.get(claim.recipientId);
    if (list) list.push(claim);
    else byRecipient.set(claim.recipientId, [claim]);
  }

  for (const [recipientId, claims] of byRecipient) {
    claims.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    for (let i = 0; i < claims.length; i += CALLS_PER_MESSAGE) {
      summary.messages++;
      try {
        const outcome = await deps.send(recipientId, callDigestText(claims.slice(i, i + CALLS_PER_MESSAGE)));
        if (outcome === "sent") summary.sent++;
        else summary.notSent++;
      } catch {
        summary.notSent++;
      }
    }
  }
  return summary;
}

/** The production wiring: the service-role client and the bot sender. */
export function sendCallPings(): Promise<CallPingSummary> {
  return runCallPings({
    claim: async (limit) => {
      const { data, error } = await createAdminClient().rpc("telegram_call_ping_claim", { p_limit: limit });
      if (error) throw error;
      return data;
    },
    send: sendReminder,
  });
}
