// COH-011 (docs/decisions/0180) — the Telegram message that says the author's voice
// feedback or final comment is ready (docs/decisions/0140, events 2 and 3). Whether a
// publication earns a message, and the sent log that keeps a republish or an edit from
// sending a second one, are decided in SQL (telegram_feedback_ping_claim, migration
// 093); this module words the text, builds the link and drives the two calls. Effects
// are injected so vitest covers every branch. It never throws: the publish routes run
// it after the RPC has succeeded, and a Telegram failure must not reach that response.
//
// Unlike the message ping (pings.ts), this text does carry authored titles: 0140's
// wording names the lesson and the course, and the privacy policy lists "course and
// lesson titles" among what Telegram receives. Wording pending partner review.

import { createAdminClient } from "../supabase/admin";
import { SITE_URL } from "../site";
import { sendReminder, type SendOutcome } from "./send";
import { parseTelegramLang, type TelegramLang } from "./messages";

export type FeedbackKind = "voice" | "final";

/** What telegram_feedback_ping_claim returns when it lets a message through. */
export type FeedbackClaim =
  | { kind: "voice"; recipientId: string; lang: TelegramLang; courseSlug: string; lessonSlug: string; lessonTitle: string }
  | { kind: "final"; recipientId: string; lang: TelegramLang; courseTitle: string; runId: string };

/** 0140's draft wording, with the links appended after a colon. */
const TEXT = {
  voice: {
    en: (lesson: string, link: string) => `Your recording in “${lesson}” has feedback: ${link}`,
    ru: (lesson: string, link: string) => `Есть отзыв на вашу запись в уроке «${lesson}»: ${link}`,
  },
  final: {
    en: (course: string, link: string) => `Your final comment for “${course}” is ready: ${link}`,
    ru: (course: string, link: string) => `Готов итоговый комментарий по курсу «${course}»: ${link}`,
  },
} as const;

/** The lesson page for a voice take, the before/after screen (COH-005) for a final comment. */
export function feedbackLink(claim: FeedbackClaim, origin: string): string {
  return claim.kind === "voice"
    ? `${origin}/courses/${encodeURIComponent(claim.courseSlug)}/${encodeURIComponent(claim.lessonSlug)}`
    : `${origin}/runs/${encodeURIComponent(claim.runId)}`;
}

export function feedbackText(claim: FeedbackClaim, origin: string): string {
  const link = feedbackLink(claim, origin);
  return claim.kind === "voice"
    ? TEXT.voice[claim.lang](claim.lessonTitle, link)
    : TEXT.final[claim.lang](claim.courseTitle, link);
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** Reads the claim function's JSON; null for anything but a claimed message. */
export function readFeedbackClaim(data: unknown): FeedbackClaim | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.claimed !== true) return null;
  const recipientId = str(d.recipient_id);
  if (!recipientId) return null;
  const lang = parseTelegramLang(d.lang);
  if (d.kind === "voice") {
    const courseSlug = str(d.course_slug);
    const lessonSlug = str(d.lesson_slug);
    const lessonTitle = str(d.lesson_title);
    if (!courseSlug || !lessonSlug || !lessonTitle) return null;
    return { kind: "voice", recipientId, lang, courseSlug, lessonSlug, lessonTitle };
  }
  if (d.kind === "final") {
    const courseTitle = str(d.course_title);
    const runId = str(d.run_id);
    if (!courseTitle || !runId) return null;
    return { kind: "final", recipientId, lang, courseTitle, runId };
  }
  return null;
}

export type FeedbackPingDeps = {
  /** telegram_feedback_ping_claim (service role): the raw JSON it answers. */
  claim: (kind: FeedbackKind, id: string) => Promise<unknown>;
  send: (userId: string, text: string) => Promise<SendOutcome>;
  origin: string;
};

export type FeedbackPingResult = "sent" | "skipped" | "send_failed" | "error";

/** "skipped": no message was due (draft, already handled, not linked). Never throws. */
export async function pingFeedbackPublished(
  kind: FeedbackKind,
  id: string,
  deps: FeedbackPingDeps,
): Promise<FeedbackPingResult> {
  try {
    const claim = readFeedbackClaim(await deps.claim(kind, id));
    if (!claim) return "skipped";
    const outcome = await deps.send(claim.recipientId, feedbackText(claim, deps.origin));
    return outcome === "sent" ? "sent" : "send_failed";
  } catch {
    return "error";
  }
}

/** The production wiring: the service-role client, the bot sender and the site origin. */
export function pingForFeedback(kind: FeedbackKind, id: string): Promise<FeedbackPingResult> {
  return pingFeedbackPublished(kind, id, {
    claim: async (k, i) => {
      const { data, error } = await createAdminClient().rpc("telegram_feedback_ping_claim", { p_kind: k, p_id: i });
      if (error) throw error;
      return data;
    },
    send: sendReminder,
    origin: SITE_URL,
  });
}
