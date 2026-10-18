// TCH-012 (docs/decisions/0177) — the Telegram ping for a new teacher/student
// message. Whether a message earns a ping, and the hourly limit, are decided in SQL
// (telegram_message_ping_claim, migration 091); this module words the text, builds
// the link and drives the two calls. Effects are injected so vitest covers every
// branch. It never throws: the messages route runs it after the post has succeeded,
// and a Telegram failure must not reach that response.
//
// The text names no person and carries nothing of the message: Telegram receives a
// fixed sentence and a link (privacy policy, "Telegram receives the text of each
// message"). Wording pending partner review.

import { createAdminClient } from "../supabase/admin";
import { SITE_URL } from "../site";
import { threadPath } from "../messages/messages";
import { sendReminder, type SendOutcome } from "./send";
import { parseTelegramLang, type TelegramLang } from "./messages";

export type PingSide = "teacher" | "student";

/** What telegram_message_ping_claim returns when it lets a ping through. */
export type PingClaim = {
  recipientId: string;
  toRole: PingSide;
  lang: TelegramLang;
  teacherId: string;
  studentId: string;
};

const TEXT = {
  // The recipient is the student: the teacher wrote.
  student: { en: "Your teacher sent you a message:", ru: "Вам написал преподаватель:" },
  // The recipient is the teacher: a student wrote.
  teacher: { en: "A student sent you a message:", ru: "Вам написал ученик:" },
} as const;

/** The link to the conversation, from the RECIPIENT's side: their peer's id, their surface. */
export function pingLink(claim: Pick<PingClaim, "toRole" | "teacherId" | "studentId">, origin: string): string {
  return claim.toRole === "student"
    ? `${origin}${threadPath("student", claim.teacherId)}`
    : `${origin}${threadPath("teacher", claim.studentId)}`;
}

export function pingText(claim: PingClaim, origin: string): string {
  return `${TEXT[claim.toRole][claim.lang]} ${pingLink(claim, origin)}`;
}

/** Reads the claim function's JSON; null for anything but a claimed ping. */
export function readClaim(data: unknown): PingClaim | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.claimed !== true) return null;
  const { recipient_id, to_role, teacher_id, student_id } = d;
  if (typeof recipient_id !== "string" || typeof teacher_id !== "string" || typeof student_id !== "string") return null;
  if (to_role !== "teacher" && to_role !== "student") return null;
  return {
    recipientId: recipient_id,
    toRole: to_role,
    lang: parseTelegramLang(d.lang),
    teacherId: teacher_id,
    studentId: student_id,
  };
}

export type PingDeps = {
  /** telegram_message_ping_claim (service role): the raw JSON it answers. */
  claim: (messageId: string) => Promise<unknown>;
  send: (userId: string, text: string) => Promise<SendOutcome>;
  origin: string;
};

export type PingResult = "sent" | "skipped" | "send_failed" | "error";

/** "skipped": no ping was due (not linked, throttled, unknown message). Never throws. */
export async function pingNewMessage(messageId: string, deps: PingDeps): Promise<PingResult> {
  try {
    const claim = readClaim(await deps.claim(messageId));
    if (!claim) return "skipped";
    const outcome = await deps.send(claim.recipientId, pingText(claim, deps.origin));
    return outcome === "sent" ? "sent" : "send_failed";
  } catch {
    return "error";
  }
}

/** The production wiring: the service-role client, the bot sender and the site origin. */
export function pingForMessage(messageId: string): Promise<PingResult> {
  return pingNewMessage(messageId, {
    claim: async (id) => {
      const { data, error } = await createAdminClient().rpc("telegram_message_ping_claim", { p_message_id: id });
      if (error) throw error;
      return data;
    },
    send: sendReminder,
    origin: SITE_URL,
  });
}
