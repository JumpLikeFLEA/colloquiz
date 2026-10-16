import { FeedbackContentSchema, feedbackTextLength, type FeedbackContent } from "../feedback/content";

// TCH-004 — messages between a linked student and their teacher (migration
// 079, docs/decisions/0151). Pure: the shapes 079's functions return, the
// mapping from their raw rows, and the error vocabulary of send_teacher_message.
// Every rule (who may post, whether the link is live, what counts as
// unanswered, the rate limit) is decided in SQL; this module only renames
// fields and mirrors the body cap for the composer's counter. The reads live
// in lib/messages/messagesServer.ts so a Client Component can import these
// without pulling in the server Supabase client.

/** The cap on a message's text, mirroring 079's `_message_body_valid`. The
 * database decides; this is for the composer's counter and the route's 400. */
export const MESSAGE_MAX_CHARS = 2000;

/** A conversation peer's id in a URL (a profile uuid). */
export const PEER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ThreadRole = "student" | "teacher";

/** One row of `message_threads(role)` (079). */
export type ThreadRow = {
  conversation_id: string | null;
  peer_id: string;
  peer_label: string;
  is_open: boolean;
  last_at: string | null;
  last_is_mine: boolean | null;
  unanswered: boolean;
  unread_count: number;
};

export type Thread = {
  /** null: a linked peer with no conversation yet. */
  conversationId: string | null;
  peerId: string;
  peerLabel: string;
  /** false: the link has ended, so the conversation is readable and closed. */
  isOpen: boolean;
  lastAt: string | null;
  lastIsMine: boolean | null;
  /** The last message is the student's and the link is live (SQL decides). */
  unanswered: boolean;
  unreadCount: number;
};

export function toThread(row: ThreadRow): Thread {
  return {
    conversationId: row.conversation_id,
    peerId: row.peer_id,
    peerLabel: row.peer_label,
    isOpen: row.is_open,
    lastAt: row.last_at,
    lastIsMine: row.last_is_mine,
    unanswered: row.unanswered,
    unreadCount: row.unread_count,
  };
}

/** The teacher's "unanswered" count: the nav badge and the inbox section both
 * come from the same rows (0151 Decision 7), so they can't disagree. */
export function unansweredThreads(threads: readonly Thread[]): Thread[] {
  return threads.filter((t) => t.unanswered);
}

/** Total unread across threads, for a "N new" pill. */
export function unreadTotal(threads: readonly Thread[]): number {
  return threads.reduce((n, t) => n + t.unreadCount, 0);
}

/** One row of `conversation_messages(teacher, student)` (079). */
export type MessageRow = {
  message_id: string;
  author_id: string;
  mine: boolean;
  body: unknown;
  created_at: string;
  read_at: string | null;
};

export type ConversationMessage = {
  id: string;
  mine: boolean;
  /** null: a stored body that no longer parses, shown as an empty bubble
   * rather than failing the whole thread. */
  content: FeedbackContent | null;
  createdAt: string;
  /** Whether the reader had already read it when the page loaded. */
  read: boolean;
};

export function toMessage(row: MessageRow): ConversationMessage {
  const parsed = FeedbackContentSchema.safeParse(row.body);
  return {
    id: row.message_id,
    mine: row.mine,
    content: parsed.success ? parsed.data : null,
    createdAt: row.created_at,
    // Only the other party's messages can be "new" to the reader.
    read: row.mine || row.read_at != null,
  };
}

/** A message body from a request: the FeedbackContent shape, under the
 * messages cap. null when it isn't. */
export function parseMessageBody(raw: unknown): FeedbackContent | null {
  const parsed = FeedbackContentSchema.safeParse(raw);
  if (!parsed.success) return null;
  return feedbackTextLength(parsed.data) <= MESSAGE_MAX_CHARS ? parsed.data : null;
}

/** `send_teacher_message`'s refusals (079) and the HTTP answer for each. */
export type SendError = "unauthenticated" | "forbidden" | "invalid_body" | "not_linked" | "closed" | "rate_limited";

const SEND_ERRORS: Record<SendError, { status: number; message: string }> = {
  unauthenticated: { status: 401, message: "Not signed in." },
  forbidden: { status: 403, message: "You can't write in this conversation." },
  invalid_body: { status: 400, message: `A message needs some text and is at most ${MESSAGE_MAX_CHARS} characters.` },
  not_linked: { status: 403, message: "You aren't linked to this person." },
  closed: { status: 409, message: "This conversation is closed: the link has ended." },
  rate_limited: { status: 429, message: "You've sent a lot of messages in the last hour. Please try again a little later." },
};

export function sendErrorResponse(code: string): { status: number; message: string } {
  return SEND_ERRORS[code as SendError] ?? { status: 400, message: "Could not send the message." };
}

/** The conversation page's path for a peer, per role. */
export function threadPath(role: ThreadRole, peerId: string): string {
  return role === "student" ? `/my/messages/${peerId}` : `/studio/messages/${peerId}`;
}

/** The (teacher, student) pair for a caller in a role and their peer. */
export function pairFor(role: ThreadRole, me: string, peerId: string): { teacherId: string; studentId: string } {
  return role === "student" ? { teacherId: peerId, studentId: me } : { teacherId: me, studentId: peerId };
}
