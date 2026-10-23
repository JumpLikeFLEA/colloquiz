import { describe, expect, it, vi } from "vitest";
import {
  BOT_USERNAME,
  helpMessage,
  invalidLinkMessage,
  linkedMessage,
  parseBotCommand,
  readUpdate,
  startLink,
  stoppedMessage,
} from "./messages";
import {
  feedbackLink,
  feedbackText,
  pingFeedbackPublished,
  readFeedbackClaim,
  type FeedbackPingDeps,
} from "./feedbackPings";
import {
  CALLS_PER_MESSAGE,
  callDigestText,
  callLine,
  callWhen,
  readCallClaim,
  runCallPings,
  type CallPingDeps,
} from "./callPings";
import { readWeekClaim, runWeekPings, weekLink, weekText, type WeekPingDeps } from "./weekPings";
import { pingLink, pingNewMessage, pingText, readClaim, type PingDeps } from "./pings";
import { postSendMessage, sendToUser, type SenderDeps } from "./send";
import { handleUpdate, isValidWebhookSecret, type WebhookDeps } from "./webhook";

const TOKEN = "a".repeat(64);

describe("parseBotCommand", () => {
  it("reads /start with a token, with and without the bot name", () => {
    expect(parseBotCommand(`/start ${TOKEN}`)).toEqual({ kind: "start", token: TOKEN });
    expect(parseBotCommand(`/start@${BOT_USERNAME} ${TOKEN}`)).toEqual({ kind: "start", token: TOKEN });
    expect(parseBotCommand(`  /START   ${TOKEN}  `)).toEqual({ kind: "start", token: TOKEN });
  });
  it("treats a /start without a well-formed token as a plain start", () => {
    expect(parseBotCommand("/start")).toEqual({ kind: "start", token: null });
    expect(parseBotCommand("/start ?x")).toEqual({ kind: "start", token: null });
    expect(parseBotCommand(`/start ${"a".repeat(65)}`)).toEqual({ kind: "start", token: null });
    expect(parseBotCommand("/start a;b")).toEqual({ kind: "start", token: null });
  });
  it("reads /stop and calls everything else other", () => {
    expect(parseBotCommand("/stop")).toEqual({ kind: "stop" });
    expect(parseBotCommand(`/stop@${BOT_USERNAME}`)).toEqual({ kind: "stop" });
    expect(parseBotCommand("hello")).toEqual({ kind: "other" });
    expect(parseBotCommand("")).toEqual({ kind: "other" });
    expect(parseBotCommand("/stopping")).toEqual({ kind: "other" });
  });
});

describe("startLink", () => {
  it("is the t.me deep link with the token", () => {
    expect(startLink(TOKEN)).toBe(`https://t.me/${BOT_USERNAME}?start=${TOKEN}`);
  });
});

describe("readUpdate", () => {
  const ok = { message: { text: "/stop", from: { id: 7 }, chat: { id: 7, type: "private" } } };
  it("returns the private chat message", () => {
    expect(readUpdate(ok)).toEqual({ chatId: 7, fromId: 7, text: "/stop" });
  });
  it("ignores group chats, mismatched ids, non-text and junk", () => {
    expect(readUpdate({ message: { ...ok.message, chat: { id: -100, type: "group" } } })).toBeNull();
    expect(readUpdate({ message: { ...ok.message, chat: { id: 8, type: "private" } } })).toBeNull();
    expect(readUpdate({ message: { from: { id: 7 }, chat: { id: 7, type: "private" } } })).toBeNull();
    expect(readUpdate({ edited_message: ok.message })).toBeNull();
    expect(readUpdate(null)).toBeNull();
    expect(readUpdate("x")).toBeNull();
    expect(readUpdate({ message: { ...ok.message, from: { id: "7" } } })).toBeNull();
  });
});

describe("wording", () => {
  it("has a non-empty, distinct text per language, and both for the unknown", () => {
    for (const f of [linkedMessage, stoppedMessage]) {
      expect(f("ru")).not.toBe(f("en"));
      expect(f("ru").length).toBeGreaterThan(10);
    }
    expect(linkedMessage("en")).toContain("/stop");
    expect(linkedMessage("ru")).toContain("/stop");
    expect(helpMessage(null)).toContain(helpMessage("ru"));
    expect(helpMessage(null)).toContain(helpMessage("en"));
    expect(invalidLinkMessage()).toContain("\n\n");
  });
});

describe("isValidWebhookSecret", () => {
  it("accepts only the exact secret", () => {
    expect(isValidWebhookSecret("s3cret", "s3cret")).toBe(true);
    expect(isValidWebhookSecret("s3cret!", "s3cret")).toBe(false);
    expect(isValidWebhookSecret("S3cret", "s3cret")).toBe(false);
  });
  it("refuses a missing header and an unset or empty secret", () => {
    expect(isValidWebhookSecret(null, "s3cret")).toBe(false);
    expect(isValidWebhookSecret("", "s3cret")).toBe(false);
    expect(isValidWebhookSecret("s3cret", undefined)).toBe(false);
    expect(isValidWebhookSecret("", "")).toBe(false);
  });
});

describe("handleUpdate", () => {
  const update = (text: string) => ({ message: { text, from: { id: 5 }, chat: { id: 5, type: "private" } } });
  function deps(over: Partial<WebhookDeps> = {}) {
    return {
      claim: vi.fn(async () => "ru" as const),
      stop: vi.fn(async () => "en" as const),
      reply: vi.fn(async () => {}),
      ...over,
    };
  }

  it("/start <token> links the senders chat and replies in the saved language", async () => {
    const d = deps();
    await handleUpdate(update(`/start ${TOKEN}`), d);
    expect(d.claim).toHaveBeenCalledWith(TOKEN, 5);
    expect(d.reply).toHaveBeenCalledWith(5, linkedMessage("ru"));
  });
  it("an invalid, used or expired token gets the both-language refusal", async () => {
    const d = deps({ claim: vi.fn(async () => null) });
    await handleUpdate(update(`/start ${TOKEN}`), d);
    expect(d.reply).toHaveBeenCalledWith(5, invalidLinkMessage());
    expect(d.stop).not.toHaveBeenCalled();
  });
  it("/stop stops the chat and replies in the links language", async () => {
    const d = deps();
    await handleUpdate(update("/stop"), d);
    expect(d.stop).toHaveBeenCalledWith(5);
    expect(d.reply).toHaveBeenCalledWith(5, stoppedMessage("en"));
  });
  it("/stop with nothing on still answers, in both languages", async () => {
    const d = deps({ stop: vi.fn(async () => null) });
    await handleUpdate(update("/stop"), d);
    expect(d.reply).toHaveBeenCalledWith(5, `${stoppedMessage("ru")}\n\n${stoppedMessage("en")}`);
  });
  it("anything else, including a bare /start, gets help and changes nothing", async () => {
    for (const text of ["hi", "/start", "/help"]) {
      const d = deps();
      await handleUpdate(update(text), d);
      expect(d.reply).toHaveBeenCalledWith(5, helpMessage(null));
      expect(d.claim).not.toHaveBeenCalled();
      expect(d.stop).not.toHaveBeenCalled();
    }
  });
  it("does nothing for an update it does not answer", async () => {
    const d = deps();
    await handleUpdate({ my_chat_member: {} }, d);
    expect(d.reply).not.toHaveBeenCalled();
  });
});

describe("postSendMessage", () => {
  it("classifies the Bot API answer", async () => {
    expect(await postSendMessage("T", 1, "x", async () => ({ status: 200 }))).toBe("sent");
    expect(await postSendMessage("T", 1, "x", async () => ({ status: 403 }))).toBe("blocked");
    expect(await postSendMessage("T", 1, "x", async () => ({ status: 429 }))).toBe("failed");
    expect(await postSendMessage("T", 1, "x", async () => ({ status: 500 }))).toBe("failed");
  });
  it("never throws on a network error", async () => {
    const out = await postSendMessage("T", 1, "x", async () => {
      throw new Error("offline");
    });
    expect(out).toBe("failed");
  });
  it("posts to the bot sendMessage with the chat id and text", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: { method: string; headers: Record<string, string>; body: string }) => ({ status: 200 }));
    await postSendMessage("TOK", 42, "hello", fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/botTOK/sendMessage");
    expect(JSON.parse(init.body)).toMatchObject({ chat_id: 42, text: "hello" });
  });
});

describe("sendToUser", () => {
  function deps(over: Partial<SenderDeps> = {}) {
    return {
      botToken: "T",
      linkFor: vi.fn(async (_userId: string) => ({ chatId: 9 }) as { chatId: number } | null),
      stopChat: vi.fn(async (_chatId: number) => {}),
      fetchImpl: vi.fn(async () => ({ status: 200 })),
      ...over,
    } satisfies SenderDeps;
  }
  it("sends to the active links chat", async () => {
    const d = deps();
    expect(await sendToUser("u", "hi", d)).toBe("sent");
    expect(d.stopChat).not.toHaveBeenCalled();
  });
  it("a 403 marks the link stopped", async () => {
    const d = deps({ fetchImpl: vi.fn(async () => ({ status: 403 })) });
    expect(await sendToUser("u", "hi", d)).toBe("blocked");
    expect(d.stopChat).toHaveBeenCalledWith(9);
  });
  it("a user with no active link is not messaged", async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200 }));
    expect(await sendToUser("u", "hi", deps({ linkFor: vi.fn(async () => null), fetchImpl }))).toBe("not_linked");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("a failed send does not stop the link, and no failure throws into the caller", async () => {
    const d = deps({ fetchImpl: vi.fn(async () => ({ status: 500 })) });
    expect(await sendToUser("u", "hi", d)).toBe("failed");
    expect(d.stopChat).not.toHaveBeenCalled();
    const failingLookup = deps({
      linkFor: async () => {
        throw new Error("db");
      },
    });
    expect(await sendToUser("u", "hi", failingLookup)).toBe("failed");
    const failingStop = deps({
      stopChat: async () => {
        throw new Error("db");
      },
      fetchImpl: async () => ({ status: 403 }),
    });
    expect(await sendToUser("u", "hi", failingStop)).toBe("failed");
    expect(await sendToUser("u", "hi", deps({ botToken: undefined }))).toBe("failed");
  });
});

describe("message pings (TCH-012)", () => {
  const T = "11111111-1111-4111-8111-111111111111";
  const S = "22222222-2222-4222-8222-222222222222";
  const ORIGIN = "https://example.test";
  const claimJson = (over: Record<string, unknown> = {}) => ({
    claimed: true,
    recipient_id: S,
    to_role: "student",
    lang: "ru",
    teacher_id: T,
    student_id: S,
    ...over,
  });

  it("links to the conversation on the recipient's own surface, keyed by their peer", () => {
    expect(pingLink({ toRole: "student", teacherId: T, studentId: S }, ORIGIN)).toBe(`${ORIGIN}/my/messages/${T}`);
    expect(pingLink({ toRole: "teacher", teacherId: T, studentId: S }, ORIGIN)).toBe(`${ORIGIN}/studio/messages/${S}`);
  });

  it("words the text per side and language, with the link and nothing else", () => {
    const c = (toRole: "teacher" | "student", lang: "ru" | "en") => readClaim(claimJson({ to_role: toRole, lang }))!;
    expect(pingText(c("student", "en"), ORIGIN)).toBe(`Your teacher sent you a message: ${ORIGIN}/my/messages/${T}`);
    expect(pingText(c("student", "ru"), ORIGIN)).toBe(`Вам написал преподаватель: ${ORIGIN}/my/messages/${T}`);
    expect(pingText(c("teacher", "en"), ORIGIN)).toBe(`A student sent you a message: ${ORIGIN}/studio/messages/${S}`);
    expect(pingText(c("teacher", "ru"), ORIGIN)).toBe(`Вам написал ученик: ${ORIGIN}/studio/messages/${S}`);
  });

  it("reads only a claimed ping with every field", () => {
    expect(readClaim(claimJson())).toEqual({ recipientId: S, toRole: "student", lang: "ru", teacherId: T, studentId: S });
    expect(readClaim(claimJson({ lang: "xx" }))?.lang).toBe("en");
    expect(readClaim({ claimed: false, reason: "throttled" })).toBeNull();
    expect(readClaim(claimJson({ to_role: "admin" }))).toBeNull();
    expect(readClaim(claimJson({ recipient_id: 5 }))).toBeNull();
    expect(readClaim(null)).toBeNull();
    expect(readClaim("x")).toBeNull();
  });

  function deps(over: Partial<PingDeps> = {}) {
    return {
      claim: vi.fn(async () => claimJson() as unknown),
      send: vi.fn(async () => "sent" as const),
      origin: ORIGIN,
      ...over,
    } as PingDeps & { claim: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };
  }

  it("claims, then sends the worded text to the recipient", async () => {
    const d = deps();
    expect(await pingNewMessage("m1", d)).toBe("sent");
    expect(d.claim).toHaveBeenCalledWith("m1");
    expect(d.send).toHaveBeenCalledWith(S, `Вам написал преподаватель: ${ORIGIN}/my/messages/${T}`);
  });

  it("sends nothing when no ping is due (not linked, throttled, unknown)", async () => {
    for (const reason of ["not_linked", "throttled", "no_message"]) {
      const d = deps({ claim: vi.fn(async () => ({ claimed: false, reason }) as unknown) });
      expect(await pingNewMessage("m1", d)).toBe("skipped");
      expect(d.send).not.toHaveBeenCalled();
    }
  });

  it("never throws: a failed claim or send is reported, not raised", async () => {
    const boom = (m: string) => vi.fn(async () => {
      throw new Error(m);
    });
    expect(await pingNewMessage("m1", deps({ claim: boom("db") }))).toBe("error");
    expect(await pingNewMessage("m1", deps({ send: vi.fn(async () => "failed" as const) }))).toBe("send_failed");
    expect(await pingNewMessage("m1", deps({ send: vi.fn(async () => "blocked" as const) }))).toBe("send_failed");
    expect(await pingNewMessage("m1", deps({ send: boom("net") }))).toBe("error");
  });
});

// COH-011 (docs/decisions/0180) — the feedback / final comment message.
describe("feedback pings", () => {
  const ORIGIN = "https://colloquiz.app";
  const voice = {
    claimed: true,
    kind: "voice",
    recipient_id: "u1",
    lang: "ru",
    course_slug: "future-imperfect",
    course_title: "Future Imperfect",
    lesson_slug: "lesson-1",
    lesson_title: "Planning",
    run_id: null,
  };
  const final = {
    claimed: true,
    kind: "final",
    recipient_id: "u1",
    lang: "en",
    course_slug: null,
    course_title: "Future Imperfect",
    lesson_slug: null,
    lesson_title: null,
    run_id: "11111111-1111-1111-1111-111111111111",
  };

  it("reads a voice and a final claim, in the saved language", () => {
    expect(readFeedbackClaim(voice)).toEqual({
      kind: "voice",
      recipientId: "u1",
      lang: "ru",
      courseSlug: "future-imperfect",
      lessonSlug: "lesson-1",
      lessonTitle: "Planning",
    });
    expect(readFeedbackClaim(final)).toEqual({
      kind: "final",
      recipientId: "u1",
      lang: "en",
      courseTitle: "Future Imperfect",
      runId: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("reads anything that is not a complete claim as null", () => {
    expect(readFeedbackClaim(null)).toBeNull();
    expect(readFeedbackClaim({ claimed: false, reason: "already_handled" })).toBeNull();
    expect(readFeedbackClaim({ ...voice, lesson_slug: null })).toBeNull();
    expect(readFeedbackClaim({ ...voice, recipient_id: 5 })).toBeNull();
    expect(readFeedbackClaim({ ...final, run_id: "" })).toBeNull();
    expect(readFeedbackClaim({ ...final, kind: "other" })).toBeNull();
  });

  it("words 0140's texts in both languages with the right link", () => {
    const v = readFeedbackClaim(voice)!;
    expect(feedbackText(v, ORIGIN)).toBe(
      "Есть отзыв на вашу запись в уроке «Planning»: https://colloquiz.app/courses/future-imperfect/lesson-1",
    );
    expect(feedbackText({ ...v, lang: "en" }, ORIGIN)).toBe(
      "Your recording in “Planning” has feedback: https://colloquiz.app/courses/future-imperfect/lesson-1",
    );
    const f = readFeedbackClaim(final)!;
    expect(feedbackText(f, ORIGIN)).toBe(
      "Your final comment for “Future Imperfect” is ready: https://colloquiz.app/runs/11111111-1111-1111-1111-111111111111",
    );
    expect(feedbackText({ ...f, lang: "ru" }, ORIGIN)).toBe(
      "Готов итоговый комментарий по курсу «Future Imperfect»: https://colloquiz.app/runs/11111111-1111-1111-1111-111111111111",
    );
  });

  it("encodes a slug in the link", () => {
    const v = readFeedbackClaim({ ...voice, lesson_slug: "a b/c" })!;
    expect(feedbackLink(v, ORIGIN)).toBe("https://colloquiz.app/courses/future-imperfect/a%20b%2Fc");
  });

  const deps = (over: Partial<FeedbackPingDeps> = {}): FeedbackPingDeps => ({
    claim: vi.fn(async () => voice),
    send: vi.fn(async () => "sent" as const),
    origin: ORIGIN,
    ...over,
  });

  it("claims, then sends the worded text to the recipient", async () => {
    const d = deps();
    expect(await pingFeedbackPublished("voice", "sub-1", d)).toBe("sent");
    expect(d.claim).toHaveBeenCalledWith("voice", "sub-1");
    expect(d.send).toHaveBeenCalledWith("u1", expect.stringContaining("/courses/future-imperfect/lesson-1"));
  });

  it("sends nothing when SQL did not claim (draft, already handled, not linked)", async () => {
    for (const reason of ["not_published", "already_handled", "not_linked", "no_target"]) {
      const d = deps({ claim: vi.fn(async () => ({ claimed: false, reason })) });
      expect(await pingFeedbackPublished("final", "e-1", d)).toBe("skipped");
      expect(d.send).not.toHaveBeenCalled();
    }
  });

  it("reports a failed or blocked send without throwing", async () => {
    for (const outcome of ["failed", "blocked", "not_linked"] as const) {
      expect(await pingFeedbackPublished("voice", "s", deps({ send: vi.fn(async () => outcome) }))).toBe("send_failed");
    }
  });

  it("never throws, whichever effect throws", async () => {
    expect(
      await pingFeedbackPublished("voice", "s", deps({ claim: vi.fn(async () => { throw new Error("db"); }) })),
    ).toBe("error");
    expect(
      await pingFeedbackPublished("voice", "s", deps({ send: vi.fn(async () => { throw new Error("net"); }) })),
    ).toBe("error");
  });
});

describe("week pings (COH-012)", () => {
  const ORIGIN = "https://colloquiz.app";
  const row = {
    enrolment_id: "e1",
    week: 2,
    recipient_id: "u1",
    lang: "ru",
    course_slug: "future-imperfect",
    course_title: "Future Imperfect",
    run_id: "r1",
    opened_at: "2026-10-20T10:00:00Z",
  };

  it("reads a claim row, in the saved language", () => {
    expect(readWeekClaim(row)).toEqual({
      enrolmentId: "e1",
      week: 2,
      recipientId: "u1",
      lang: "ru",
      courseSlug: "future-imperfect",
      courseTitle: "Future Imperfect",
    });
    expect(readWeekClaim({ ...row, lang: "xx" })!.lang).toBe("en");
  });

  it("reads anything that is not a complete row as null", () => {
    expect(readWeekClaim(null)).toBeNull();
    expect(readWeekClaim({ ...row, week: 0 })).toBeNull();
    expect(readWeekClaim({ ...row, week: 2.5 })).toBeNull();
    expect(readWeekClaim({ ...row, week: "2" })).toBeNull();
    expect(readWeekClaim({ ...row, course_title: "" })).toBeNull();
    expect(readWeekClaim({ ...row, recipient_id: null })).toBeNull();
    expect(readWeekClaim({ ...row, enrolment_id: 5 })).toBeNull();
  });

  it("words 0140's texts in both languages: week 1 is 'the course has started'", () => {
    const w2 = readWeekClaim(row)!;
    expect(weekText(w2, ORIGIN)).toBe(
      "Неделя 2 курса «Future Imperfect» открыта: https://colloquiz.app/courses/future-imperfect",
    );
    expect(weekText({ ...w2, lang: "en" }, ORIGIN)).toBe(
      "Week 2 of “Future Imperfect” is open: https://colloquiz.app/courses/future-imperfect",
    );
    const w1 = { ...w2, week: 1 };
    expect(weekText(w1, ORIGIN)).toBe("Курс «Future Imperfect» начался: https://colloquiz.app/courses/future-imperfect");
    expect(weekText({ ...w1, lang: "en" }, ORIGIN)).toBe(
      "“Future Imperfect” has started: https://colloquiz.app/courses/future-imperfect",
    );
  });

  it("encodes the slug in the link", () => {
    expect(weekLink({ courseSlug: "a b/c" }, ORIGIN)).toBe("https://colloquiz.app/courses/a%20b%2Fc");
  });

  const deps = (over: Partial<WeekPingDeps> = {}): WeekPingDeps => ({
    claim: vi.fn(async () => [row, { ...row, enrolment_id: "e2", recipient_id: "u2", lang: "en", week: 1 }]),
    send: vi.fn(async () => "sent" as const),
    origin: ORIGIN,
    ...over,
  });

  it("claims, then sends each worded text to its recipient", async () => {
    const d = deps();
    expect(await runWeekPings(d, 50)).toEqual({ claimed: 2, sent: 2, notSent: 0, unreadable: 0, claimFailed: false });
    expect(d.claim).toHaveBeenCalledWith(50);
    expect(d.send).toHaveBeenNthCalledWith(1, "u1", expect.stringContaining("Неделя 2"));
    expect(d.send).toHaveBeenNthCalledWith(2, "u2", expect.stringContaining("has started"));
  });

  it("sends nothing when SQL claimed nothing (a re-run, no week open, nobody linked)", async () => {
    for (const none of [[], null, undefined]) {
      const d = deps({ claim: vi.fn(async () => none) });
      expect(await runWeekPings(d)).toEqual({ claimed: 0, sent: 0, notSent: 0, unreadable: 0, claimFailed: false });
      expect(d.send).not.toHaveBeenCalled();
    }
  });

  it("counts a blocked, failed or thrown send and still sends the rest", async () => {
    const send = vi
      .fn<WeekPingDeps["send"]>()
      .mockResolvedValueOnce("blocked")
      .mockRejectedValueOnce(new Error("net"));
    const d = deps({
      send,
      claim: vi.fn(async () => [row, { ...row, enrolment_id: "e2" }, { ...row, enrolment_id: "e3" }]),
    });
    send.mockResolvedValueOnce("sent");
    expect(await runWeekPings(d)).toEqual({ claimed: 3, sent: 1, notSent: 2, unreadable: 0, claimFailed: false });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("skips an unreadable row without sending it", async () => {
    const d = deps({ claim: vi.fn(async () => [{ ...row, course_slug: null }, row]) });
    expect(await runWeekPings(d)).toEqual({ claimed: 2, sent: 1, notSent: 0, unreadable: 1, claimFailed: false });
    expect(d.send).toHaveBeenCalledTimes(1);
  });

  it("reports a failed claim without throwing and sends nothing", async () => {
    const d = deps({ claim: vi.fn(async () => { throw new Error("db"); }) });
    expect(await runWeekPings(d)).toEqual({ claimed: 0, sent: 0, notSent: 0, unreadable: 0, claimFailed: true });
    expect(d.send).not.toHaveBeenCalled();
  });
});

describe("call pings (COH-013)", () => {
  const row = {
    enrolment_id: "e1",
    call_id: "k1",
    recipient_id: "u1",
    lang: "ru",
    time_zone: "Europe/Belgrade",
    course_slug: "future-imperfect",
    course_title: "Future Imperfect",
    call_starts_at: "2026-10-28T14:00:00+00:00",
    call_title: "Speaking club",
    meet_url: "https://meet.google.com/abc-defg-hij",
  };

  it("reads a claim row, in the saved language and zone", () => {
    const c = readCallClaim(row)!;
    expect(c).toMatchObject({
      enrolmentId: "e1",
      callId: "k1",
      recipientId: "u1",
      lang: "ru",
      timeZone: "Europe/Belgrade",
      courseTitle: "Future Imperfect",
      callTitle: "Speaking club",
      meetUrl: "https://meet.google.com/abc-defg-hij",
    });
    expect(c.startsAt.toISOString()).toBe("2026-10-28T14:00:00.000Z");
    expect(readCallClaim({ ...row, lang: "xx" })!.lang).toBe("en");
    expect(readCallClaim({ ...row, time_zone: null })!.timeZone).toBeNull();
    expect(readCallClaim({ ...row, call_title: null })!.callTitle).toBeNull();
  });

  it("reads anything that is not a complete row as null", () => {
    expect(readCallClaim(null)).toBeNull();
    expect(readCallClaim({ ...row, meet_url: "" })).toBeNull();
    expect(readCallClaim({ ...row, call_starts_at: "not a date" })).toBeNull();
    expect(readCallClaim({ ...row, call_starts_at: null })).toBeNull();
    expect(readCallClaim({ ...row, course_title: "" })).toBeNull();
    expect(readCallClaim({ ...row, recipient_id: 5 })).toBeNull();
    expect(readCallClaim({ ...row, call_id: undefined })).toBeNull();
  });

  it("puts the time in the saved zone, and in UTC with none or an unknown one", () => {
    const at = new Date("2026-10-28T14:00:00Z");
    // 28 Oct 2026 is after the EU clock change: Belgrade is UTC+1.
    expect(callWhen(at, "en", "Europe/Belgrade")).toMatch(/15:00/);
    expect(callWhen(at, "en", "Asia/Tokyo")).toMatch(/23:00/);
    expect(callWhen(at, "en", null)).toMatch(/14:00.*UTC/);
    expect(callWhen(at, "en", "Not/AZone")).toMatch(/14:00.*UTC/);
    expect(callWhen(at, "ru", "Europe/Belgrade")).toMatch(/15:00/);
    // the date moves with the zone: 23:30 UTC is already the next day in Tokyo
    expect(callWhen(new Date("2026-10-28T23:30:00Z"), "en", "Asia/Tokyo")).toMatch(/29/);
  });

  it("words a call line: when, course and call title, the join link on its own line", () => {
    const line = callLine(readCallClaim(row)!);
    expect(line).toMatch(/^• .*15:00.* — Future Imperfect · Speaking club\nhttps:\/\/meet\.google\.com\/abc-defg-hij$/);
    expect(callLine(readCallClaim({ ...row, call_title: null })!)).toMatch(/ — Future Imperfect\nhttps/);
  });

  it("clips a very long authored title", () => {
    const long = "x".repeat(300);
    const line = callLine(readCallClaim({ ...row, call_title: long })!);
    expect(line.length).toBeLessThan(300);
    expect(line).toContain("…");
  });

  it("headers the digest in the saved language and promises no lead time", () => {
    const ru = callDigestText([readCallClaim(row)!]);
    const en = callDigestText([readCallClaim({ ...row, lang: "en" })!]);
    expect(ru.startsWith("Ближайшие созвоны:\n\n• ")).toBe(true);
    expect(en.startsWith("Calls coming up:\n\n• ")).toBe(true);
    // 0140: the cron fires once a day inside its hour, so no text names a lead time
    for (const text of [ru, en]) expect(text).not.toMatch(/hour|час|минут|minute/i);
  });

  const deps = (over: Partial<CallPingDeps> = {}): CallPingDeps => ({
    claim: vi.fn(async () => [
      row,
      { ...row, enrolment_id: "e2", call_id: "k2", call_starts_at: "2026-10-28T10:00:00+00:00", call_title: "Warm-up" },
      { ...row, enrolment_id: "e3", call_id: "k3", recipient_id: "u2", lang: "en", time_zone: null },
    ]),
    send: vi.fn(async () => "sent" as const),
    ...over,
  });

  it("sends one digest per learner, calls in time order, in that learner's language", async () => {
    const d = deps();
    expect(await runCallPings(d, 50)).toEqual({
      claimed: 3,
      messages: 2,
      sent: 2,
      notSent: 0,
      unreadable: 0,
      claimFailed: false,
    });
    expect(d.claim).toHaveBeenCalledWith(50);
    expect(d.send).toHaveBeenCalledTimes(2);
    const first = (d.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(first[0]).toBe("u1");
    expect(first[1]).toMatch(/^Ближайшие созвоны:/);
    expect(first[1].indexOf("Warm-up")).toBeGreaterThan(-1);
    expect(first[1].indexOf("Warm-up")).toBeLessThan(first[1].indexOf("Speaking club"));
    const second = (d.send as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(second[0]).toBe("u2");
    expect(second[1]).toMatch(/^Calls coming up:/);
    expect(second[1]).toMatch(/14:00.*UTC/);
  });

  it("splits a learner's calls over messages past the cap", async () => {
    const many = Array.from({ length: CALLS_PER_MESSAGE + 1 }, (_, i) => ({
      ...row,
      enrolment_id: `e${i}`,
      call_id: `k${i}`,
      call_starts_at: new Date(Date.UTC(2026, 9, 28, 8, i)).toISOString(),
    }));
    const d = deps({ claim: vi.fn(async () => many) });
    const s = await runCallPings(d);
    expect(s).toMatchObject({ claimed: CALLS_PER_MESSAGE + 1, messages: 2, sent: 2 });
    const bullets = (d.send as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[1].match(/•/g) ?? []).length);
    expect(bullets).toEqual([CALLS_PER_MESSAGE, 1]);
  });

  it("sends nothing when SQL claimed nothing (a re-run, a basic tier, a stopped link)", async () => {
    for (const none of [[], null, undefined]) {
      const d = deps({ claim: vi.fn(async () => none) });
      expect(await runCallPings(d)).toEqual({
        claimed: 0,
        messages: 0,
        sent: 0,
        notSent: 0,
        unreadable: 0,
        claimFailed: false,
      });
      expect(d.send).not.toHaveBeenCalled();
    }
  });

  it("counts a blocked, failed or thrown send and still sends the rest", async () => {
    const send = vi
      .fn<CallPingDeps["send"]>()
      .mockResolvedValueOnce("blocked")
      .mockRejectedValueOnce(new Error("net"))
      .mockResolvedValueOnce("sent");
    const d = deps({
      send,
      claim: vi.fn(async () => [row, { ...row, call_id: "k2", recipient_id: "u2" }, { ...row, call_id: "k3", recipient_id: "u3" }]),
    });
    expect(await runCallPings(d)).toMatchObject({ claimed: 3, messages: 3, sent: 1, notSent: 2 });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("skips an unreadable row without sending it and still sends the readable ones", async () => {
    const d = deps({ claim: vi.fn(async () => [{ ...row, meet_url: null }, { ...row, call_id: "k9", recipient_id: "u9" }]) });
    expect(await runCallPings(d)).toMatchObject({ claimed: 2, messages: 1, sent: 1, unreadable: 1 });
    expect(d.send).toHaveBeenCalledTimes(1);
  });

  it("reports a failed claim without throwing and sends nothing", async () => {
    const d = deps({ claim: vi.fn(async () => { throw new Error("db"); }) });
    expect(await runCallPings(d)).toMatchObject({ claimed: 0, messages: 0, claimFailed: true });
    expect(d.send).not.toHaveBeenCalled();
  });
});
