// COH-010 (docs/decisions/0173) — the bot's wording and the pure parsing around
// it. No I/O: the webhook handler and the sender import this, and vitest drives
// it. Event wording: the feedback / final comment text is lib/telegram/
// feedbackPings.ts (COH-011) and the message ping's is lib/telegram/pings.ts
// (TCH-012); week-open and call wording (COH-012, COH-013) is still to come.

export type TelegramLang = "ru" | "en";

/** The bot's public username (docs/decisions/0098). Not a secret. */
export const BOT_USERNAME = "Alliengll_bot";

export function parseTelegramLang(value: unknown): TelegramLang {
  return value === "ru" ? "ru" : "en";
}

/** The "Get reminders in Telegram" link: Start with this token links the chat. */
export function startLink(token: string): string {
  return `https://t.me/${BOT_USERNAME}?start=${token}`;
}

/** What /start allows in its parameter: A-Z a-z 0-9 _ -, up to 64 characters. */
const START_PARAM = /^[A-Za-z0-9_-]{1,64}$/;

export type BotCommand = { kind: "start"; token: string | null } | { kind: "stop" } | { kind: "other" };

/**
 * Reads one message's text. `/start <token>`, `/stop` and `/command@BotName`
 * forms are recognised; a /start without a well-formed token is a plain start
 * (the bot answers with help), and anything else is "other".
 */
export function parseBotCommand(text: string): BotCommand {
  const [head, ...rest] = text.trim().split(/\s+/);
  const command = head.toLowerCase().replace(/@[a-z0-9_]+$/, "");
  if (command === "/stop") return { kind: "stop" };
  if (command === "/start") {
    const param = rest[0] ?? "";
    return { kind: "start", token: START_PARAM.test(param) ? param : null };
  }
  return { kind: "other" };
}

export type IncomingMessage = { chatId: number; fromId: number; text: string };

/**
 * The one text message in a Telegram update that the bot answers, or null.
 * Only a private chat is answered, and the sender's id is what links (the
 * card's "from.id"): in a private chat it equals the chat id.
 */
export function readUpdate(update: unknown): IncomingMessage | null {
  if (!update || typeof update !== "object") return null;
  const message = (update as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const { text, from, chat } = message as { text?: unknown; from?: unknown; chat?: unknown };
  if (typeof text !== "string") return null;
  const fromId = (from as { id?: unknown } | null | undefined)?.id;
  const chatInfo = chat as { id?: unknown; type?: unknown } | null | undefined;
  if (typeof fromId !== "number" || !Number.isSafeInteger(fromId)) return null;
  if (chatInfo?.type !== "private" || chatInfo.id !== fromId) return null;
  return { chatId: chatInfo.id, fromId, text };
}

// Wording pending partner review (docs/decisions/0173). The first two are 0140's
// draft, extended to name the call reminders it also decided.
const COPY = {
  ru: {
    linked:
      "Готово. Буду писать, когда откроется новая неделя курса, придёт отзыв на запись или итоговый комментарий, а на расширенном тарифе — когда скоро созвон. Также напишу, если вам ответит преподаватель или ученик. Отключить: /stop.",
    stopped: "Напоминания отключены. Чтобы включить снова, нажмите «Получать напоминания в Telegram» на сайте.",
    invalid:
      "Эта ссылка не подходит: она устарела или уже использована. Нажмите «Получать напоминания в Telegram» на сайте ещё раз.",
    help: "Я присылаю напоминания о курсе: новая неделя, отзыв на запись, итоговый комментарий, созвон, а также сообщение от преподавателя или ученика. Включить: кнопка «Получать напоминания в Telegram» на сайте. Отключить: /stop.",
  },
  en: {
    linked:
      "Done. I'll message you when a new week of the course opens, when feedback on a recording or a final comment arrives, and, on the extended tier, before a call. I'll also message you when a teacher or student writes to you. To turn this off: /stop.",
    stopped: "Reminders are off. To turn them on again, press “Get reminders in Telegram” on the site.",
    invalid:
      "That link doesn't work: it has expired or was already used. Press “Get reminders in Telegram” on the site again.",
    help: "I send reminders about your course: a new week, feedback on a recording, a final comment, a call, a message from a teacher or student. To turn them on, press “Get reminders in Telegram” on the site. To turn them off: /stop.",
  },
} as const;

/** After a successful /start: what the bot sends and how to stop. */
export function linkedMessage(lang: TelegramLang): string {
  return COPY[lang].linked;
}

/** After /stop (also when nothing was on: stopping is idempotent). */
export function stoppedMessage(lang: TelegramLang): string {
  return COPY[lang].stopped;
}

/** Anything else. The language is the chat's saved one when it has a link, else both. */
export function helpMessage(lang: TelegramLang | null): string {
  return lang ? COPY[lang].help : `${COPY.ru.help}\n\n${COPY.en.help}`;
}

/** A /start whose token is unknown, used or expired. No link yet, so both languages. */
export function invalidLinkMessage(): string {
  return `${COPY.ru.invalid}\n\n${COPY.en.invalid}`;
}
