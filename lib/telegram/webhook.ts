// COH-010 (docs/decisions/0173) — what the bot does with one Telegram update, with
// its effects injected so vitest drives every branch. The route authenticates the
// request (isValidWebhookSecret) before anything here runs.

import { timingSafeEqual } from "node:crypto";
import {
  helpMessage,
  invalidLinkMessage,
  linkedMessage,
  parseBotCommand,
  readUpdate,
  stoppedMessage,
  type TelegramLang,
} from "./messages";

/**
 * True only when the request carried the exact secret setWebhook was given in
 * `secret_token`. Constant-time, and false for a missing header or an unset
 * secret, so an unconfigured deployment refuses everything.
 */
export function isValidWebhookSecret(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type WebhookDeps = {
  /** telegram_link_claim: the language when the token linked the chat, null when it did not. */
  claim: (token: string, chatId: number) => Promise<TelegramLang | null>;
  /** telegram_link_stop: the stopped link's language, or null when the chat had none active. */
  stop: (chatId: number) => Promise<TelegramLang | null>;
  reply: (chatId: number, text: string) => Promise<void>;
};

export async function handleUpdate(update: unknown, deps: WebhookDeps): Promise<void> {
  const message = readUpdate(update);
  if (!message) return;
  const command = parseBotCommand(message.text);

  if (command.kind === "start" && command.token) {
    const lang = await deps.claim(command.token, message.fromId);
    await deps.reply(message.chatId, lang ? linkedMessage(lang) : invalidLinkMessage());
    return;
  }
  if (command.kind === "stop") {
    const lang = await deps.stop(message.fromId);
    // Nothing was on: answer in both languages, like help does.
    await deps.reply(message.chatId, lang ? stoppedMessage(lang) : `${stoppedMessage("ru")}\n\n${stoppedMessage("en")}`);
    return;
  }
  await deps.reply(message.chatId, helpMessage(null));
}
