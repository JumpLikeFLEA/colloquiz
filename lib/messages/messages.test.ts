import { describe, expect, it } from "vitest";
import {
  MESSAGE_MAX_CHARS,
  PEER_ID_PATTERN,
  pairFor,
  parseMessageBody,
  sendErrorResponse,
  threadPath,
  toMessage,
  toThread,
  unansweredThreads,
  unreadTotal,
  type ThreadRow,
} from "./messages";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const row = (over: Partial<ThreadRow> = {}): ThreadRow => ({
  conversation_id: "c1",
  peer_id: A,
  peer_label: "Maria",
  is_open: true,
  last_at: "2026-10-16T10:00:00Z",
  last_is_mine: false,
  unanswered: false,
  unread_count: 0,
  ...over,
});

const body = (text: string) => ({ paragraphs: [{ runs: [{ text }] }] });

describe("toThread", () => {
  it("renames every field and keeps a conversation-less peer as null", () => {
    const t = toThread(row({ conversation_id: null, last_at: null, last_is_mine: null }));
    expect(t).toEqual({
      conversationId: null,
      peerId: A,
      peerLabel: "Maria",
      isOpen: true,
      lastAt: null,
      lastIsMine: null,
      unanswered: false,
      unreadCount: 0,
    });
  });
});

describe("counts", () => {
  const threads = [
    toThread(row({ peer_id: A, unanswered: true, unread_count: 2 })),
    toThread(row({ peer_id: B, unanswered: false, unread_count: 3 })),
    toThread(row({ peer_id: "x", unanswered: true, unread_count: 0 })),
  ];
  it("lists exactly the threads SQL marked unanswered", () => {
    expect(unansweredThreads(threads).map((t) => t.peerId)).toEqual([A, "x"]);
  });
  it("sums unread across threads", () => {
    expect(unreadTotal(threads)).toBe(5);
  });
  it("is zero over no threads", () => {
    expect(unansweredThreads([])).toEqual([]);
    expect(unreadTotal([])).toBe(0);
  });
});

describe("toMessage", () => {
  it("parses a stored body and treats the reader's own message as read", () => {
    const m = toMessage({ message_id: "m1", author_id: A, mine: true, body: body("hi"), created_at: "t", read_at: null });
    expect(m.content).toEqual(body("hi"));
    expect(m.read).toBe(true);
  });
  it("marks the other party's unread message as not read", () => {
    const m = toMessage({ message_id: "m2", author_id: B, mine: false, body: body("hi"), created_at: "t", read_at: null });
    expect(m.read).toBe(false);
    expect(toMessage({ message_id: "m2", author_id: B, mine: false, body: body("hi"), created_at: "t", read_at: "t2" }).read).toBe(true);
  });
  it("keeps the thread alive over a body that no longer parses", () => {
    const m = toMessage({ message_id: "m3", author_id: B, mine: false, body: { nope: 1 }, created_at: "t", read_at: null });
    expect(m.content).toBeNull();
  });
});

describe("parseMessageBody", () => {
  it("accepts the feedback shape up to the cap, with bold runs", () => {
    expect(parseMessageBody(body("a".repeat(MESSAGE_MAX_CHARS)))).not.toBeNull();
    expect(parseMessageBody({ paragraphs: [{ runs: [{ text: "x", bold: true }, { text: "y" }] }] })).not.toBeNull();
  });
  it("refuses one character over the cap, an empty body and the wrong shape", () => {
    expect(parseMessageBody(body("a".repeat(MESSAGE_MAX_CHARS + 1)))).toBeNull();
    expect(parseMessageBody({ paragraphs: [] })).toBeNull();
    expect(parseMessageBody("just text")).toBeNull();
    expect(parseMessageBody({ paragraphs: [{ runs: [{ text: "" }] }] })).toBeNull();
    expect(parseMessageBody({ paragraphs: [{ runs: [{ text: "x", html: "<b>" }] }] })).toBeNull();
  });
  it("counts the cap over every paragraph and run, not per run", () => {
    const two = { paragraphs: [{ runs: [{ text: "a".repeat(1500) }] }, { runs: [{ text: "b".repeat(501) }] }] };
    expect(parseMessageBody(two)).toBeNull();
  });
});

describe("sendErrorResponse", () => {
  it("gives each refusal its own status", () => {
    expect(sendErrorResponse("unauthenticated").status).toBe(401);
    expect(sendErrorResponse("forbidden").status).toBe(403);
    expect(sendErrorResponse("not_linked").status).toBe(403);
    expect(sendErrorResponse("invalid_body").status).toBe(400);
    expect(sendErrorResponse("closed").status).toBe(409);
    expect(sendErrorResponse("rate_limited").status).toBe(429);
  });
  it("answers an unknown code with a plain 400, never undefined", () => {
    expect(sendErrorResponse("nonsense")).toEqual({ status: 400, message: "Could not send the message." });
  });
});

describe("paths and pairs", () => {
  it("builds each role's thread path", () => {
    expect(threadPath("student", A)).toBe(`/my/messages/${A}`);
    expect(threadPath("teacher", A)).toBe(`/studio/messages/${A}`);
  });
  it("puts the caller on their own side of the pair", () => {
    expect(pairFor("student", B, A)).toEqual({ teacherId: A, studentId: B });
    expect(pairFor("teacher", B, A)).toEqual({ teacherId: B, studentId: A });
  });
  it("accepts a uuid peer id and nothing path-like", () => {
    expect(PEER_ID_PATTERN.test(A)).toBe(true);
    expect(PEER_ID_PATTERN.test("../studio")).toBe(false);
    expect(PEER_ID_PATTERN.test(A + "/x")).toBe(false);
  });
});
