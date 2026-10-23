// TCH-013 (docs/decisions/0199) — the two Telegram messages about homework (TCH-005):
// "new homework" right after a teacher assigns it, and "due tomorrow" from the daily
// cron (COH-012's route). Which (assignment, student) is due a message, and the sent log
// that keeps either from going twice, are decided in SQL (telegram_homework_new_claim
// and telegram_homework_due_claim, migration 101); this module words the text, builds
// the link and drives the claims and the sends. Effects are injected so vitest covers
// every branch. It never throws: the assign route runs the first inside after(), the cron
// runs the second, and a Telegram failure for one student must not stop the next.
//
// The text names the course and the lesson by their authored titles and carries the due
// date and a link to /my, where the homework is listed; the privacy policy lists "course
// and lesson titles and a link" among what Telegram receives. It names no teacher and
// carries no note (a note is free text the teacher wrote about a student: 0177 Decision 6
// kept names and bodies out of the bot for the same reason). Wording pending partner review.

import { createAdminClient } from "../supabase/admin";
import { SITE_URL } from "../site";
import { formatDueDate } from "../homework/homework";
import { sendReminder, type SendOutcome } from "./send";
import { parseTelegramLang, type TelegramLang } from "./messages";

/** One row of either claim: a homework, for one student. */
export type HomeworkClaim = {
  assignmentId: string;
  recipientId: string;
  lang: TelegramLang;
  courseSlug: string;
  courseTitle: string;
  /** Null for a whole-course assignment. */
  lessonTitle: string | null;
  /** "YYYY-MM-DD", or null when the teacher set no date. */
  dueOn: string | null;
};

/** Longest authored title the text carries; the rest would only push the link out of sight. */
const MAX_TITLE = 80;
const clip = (s: string): string => (s.length > MAX_TITLE ? `${s.slice(0, MAX_TITLE - 1)}…` : s);

/** "Course · Lesson", or the course alone for a whole-course assignment. */
export function homeworkTitle(claim: Pick<HomeworkClaim, "courseTitle" | "lessonTitle">): string {
  return claim.lessonTitle ? `${clip(claim.courseTitle)} · ${clip(claim.lessonTitle)}` : clip(claim.courseTitle);
}

/** Where the homework is listed. */
export function homeworkLink(origin: string): string {
  return `${origin}/my`;
}

const locale = (lang: TelegramLang) => (lang === "ru" ? "ru-RU" : "en-GB");

/** "New homework from your teacher: “Course · Lesson” (due 25 Oct). <link>" */
export function newHomeworkText(claim: HomeworkClaim, origin: string, today: Date): string {
  const title = homeworkTitle(claim);
  const link = homeworkLink(origin);
  const due = claim.dueOn ? formatDueDate(claim.dueOn, locale(claim.lang), today) : null;
  if (claim.lang === "ru") {
    return `Новое домашнее задание от преподавателя: «${title}»${due ? ` (срок: ${due})` : ""}. ${link}`;
  }
  return `New homework from your teacher: “${title}”${due ? ` (due ${due})` : ""}. ${link}`;
}

const HEADER = { en: "Homework due tomorrow:", ru: "Домашнее задание на завтра:" } as const;

/** One student's homework due tomorrow: a list and one link (all in their language). */
export function dueDigestText(claims: HomeworkClaim[], origin: string): string {
  const lines = claims.map((c) => `• ${homeworkTitle(c)}`);
  return [HEADER[claims[0].lang], lines.join("\n"), homeworkLink(origin)].join("\n\n");
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** Reads one claim row; null unless every field the text needs is present. */
export function readHomeworkClaim(row: unknown): HomeworkClaim | null {
  if (!row || typeof row !== "object") return null;
  const d = row as Record<string, unknown>;
  const assignmentId = str(d.assignment_id);
  const recipientId = str(d.recipient_id);
  const courseSlug = str(d.course_slug);
  const courseTitle = str(d.course_title);
  if (!assignmentId || !recipientId || !courseSlug || !courseTitle) return null;
  const dueOn = str(d.due_on);
  if (dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return null;
  return {
    assignmentId,
    recipientId,
    lang: parseTelegramLang(d.lang),
    courseSlug,
    courseTitle,
    lessonTitle: str(d.lesson_title),
    dueOn,
  };
}

export type HomeworkPingSummary = {
  /** Rows the claim returned (each is logged in SQL before it is sent). */
  claimed: number;
  /** Messages built: one per claimed row for new homework; one per student for the digest. */
  messages: number;
  sent: number;
  /** A send that came back blocked, failed or not_linked, or that threw. */
  notSent: number;
  /** Claimed rows missing a field the text needs. */
  unreadable: number;
  /** A claim itself failed: what it would have logged was neither logged nor sent. */
  claimFailed: boolean;
};

const emptySummary = (): HomeworkPingSummary => ({
  claimed: 0,
  messages: 0,
  sent: 0,
  notSent: 0,
  unreadable: 0,
  claimFailed: false,
});

async function sendOne(
  deps: { send: (userId: string, text: string) => Promise<SendOutcome> },
  summary: HomeworkPingSummary,
  userId: string,
  text: string,
): Promise<void> {
  summary.messages++;
  try {
    const outcome = await deps.send(userId, text);
    if (outcome === "sent") summary.sent++;
    else summary.notSent++;
  } catch {
    summary.notSent++;
  }
}

// ── New homework ───────────────────────────────────────────────────────────

export type NewHomeworkDeps = {
  /** telegram_homework_new_claim (service role): the raw rows it answers. */
  claim: (assignmentId: string, limit: number) => Promise<unknown>;
  send: (userId: string, text: string) => Promise<SendOutcome>;
  origin: string;
  now?: () => Date;
};

/** Rows one claim call returns; an assignment can reach 600 students, so the route loops. */
export const NEW_HOMEWORK_BATCH = 50;
/** Sends in flight at once; far under Telegram's 30 messages a second. */
export const SEND_CONCURRENCY = 5;
/** A hard stop on the loop: 40 batches is 2000 rows, over the 600 an assign can have. */
const MAX_BATCHES = 40;

/**
 * Tells each linked student of a just-assigned homework. Claims a batch, sends it with a
 * few in flight, and asks again until a batch comes back short. Never throws.
 */
export async function pingNewHomework(
  assignmentId: string,
  deps: NewHomeworkDeps,
  limit: number = NEW_HOMEWORK_BATCH,
): Promise<HomeworkPingSummary> {
  const summary = emptySummary();
  const today = (deps.now ?? (() => new Date()))();
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    let rows: unknown[];
    try {
      const data = await deps.claim(assignmentId, limit);
      rows = Array.isArray(data) ? data : [];
    } catch {
      summary.claimFailed = true;
      break;
    }
    summary.claimed += rows.length;
    const texts: { userId: string; text: string }[] = [];
    for (const row of rows) {
      const claim = readHomeworkClaim(row);
      if (!claim) summary.unreadable++;
      else texts.push({ userId: claim.recipientId, text: newHomeworkText(claim, deps.origin, today) });
    }
    for (let i = 0; i < texts.length; i += SEND_CONCURRENCY) {
      await Promise.all(texts.slice(i, i + SEND_CONCURRENCY).map((t) => sendOne(deps, summary, t.userId, t.text)));
    }
    if (rows.length < limit) break;
  }
  return summary;
}

/** The production wiring: the service-role client, the bot sender and the site origin. */
export function pingForHomework(assignmentId: string): Promise<HomeworkPingSummary> {
  return pingNewHomework(assignmentId, {
    claim: async (id, limit) => {
      const { data, error } = await createAdminClient().rpc("telegram_homework_new_claim", {
        p_assignment: id,
        p_limit: limit,
      });
      if (error) throw error;
      return data;
    },
    send: sendReminder,
    origin: SITE_URL,
  });
}

// ── Due tomorrow ───────────────────────────────────────────────────────────

export type HomeworkDueDeps = {
  /** telegram_homework_due_claim (service role): the raw rows it answers. */
  claim: (limit: number) => Promise<unknown>;
  send: (userId: string, text: string) => Promise<SendOutcome>;
  origin: string;
};

/** Homework items in one message; a student with more gets a second message. */
export const HOMEWORK_PER_MESSAGE = 10;
/** Max rows one cron run claims; what is left is still due on the next run if its date is still ahead. */
export const HOMEWORK_DUE_BATCH = 100;

/** One cron run of the due-tomorrow digest. Never throws. */
export async function runHomeworkDuePings(
  deps: HomeworkDueDeps,
  limit: number = HOMEWORK_DUE_BATCH,
): Promise<HomeworkPingSummary> {
  const summary = emptySummary();
  let rows: unknown[];
  try {
    const data = await deps.claim(limit);
    rows = Array.isArray(data) ? data : [];
  } catch {
    summary.claimFailed = true;
    return summary;
  }
  summary.claimed = rows.length;

  // One digest per student, in the order SQL returned them (by student, then due date).
  const byRecipient = new Map<string, HomeworkClaim[]>();
  for (const row of rows) {
    const claim = readHomeworkClaim(row);
    if (!claim) {
      summary.unreadable++;
      continue;
    }
    const list = byRecipient.get(claim.recipientId);
    if (list) list.push(claim);
    else byRecipient.set(claim.recipientId, [claim]);
  }

  for (const [recipientId, claims] of byRecipient) {
    for (let i = 0; i < claims.length; i += HOMEWORK_PER_MESSAGE) {
      await sendOne(deps, summary, recipientId, dueDigestText(claims.slice(i, i + HOMEWORK_PER_MESSAGE), deps.origin));
    }
  }
  return summary;
}

/** The production wiring: the service-role client, the bot sender and the site origin. */
export function sendHomeworkDuePings(): Promise<HomeworkPingSummary> {
  return runHomeworkDuePings({
    claim: async (limit) => {
      const { data, error } = await createAdminClient().rpc("telegram_homework_due_claim", { p_limit: limit });
      if (error) throw error;
      return data;
    },
    send: sendReminder,
    origin: SITE_URL,
  });
}
