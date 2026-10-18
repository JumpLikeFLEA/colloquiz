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
