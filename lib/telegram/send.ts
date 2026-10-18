// COH-010 (docs/decisions/0173) — the one server-only sender every reminder card
// goes through. Two layers, so both are testable without a network:
//   postSendMessage  one Bot API call; classifies the answer, never throws.
//   sendToUser       looks up the user's ACTIVE link, calls the first, and
//                    marks the link stopped on a 403 (the user blocked the bot).
// A failed send never throws into its caller: a publish or a cron run must not
// fail because Telegram did. Callers that need to know read the outcome.

import { createAdminClient } from "../supabase/admin";

export type SendOutcome = "sent" | "blocked" | "failed" | "not_linked";

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number }>;

/** One sendMessage. 2xx -> sent; 403 (blocked or kicked) -> blocked; anything else, or a thrown error -> failed. */
export async function postSendMessage(
  botToken: string,
  chatId: number,
  text: string,
  fetchImpl: FetchLike = fetch,
): Promise<"sent" | "blocked" | "failed"> {
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (res.status >= 200 && res.status < 300) return "sent";
    if (res.status === 403) return "blocked";
    return "failed";
  } catch {
    return "failed";
  }
}

export type SenderDeps = {
  botToken: string | undefined;
  /** The ACTIVE link for a user, or null (telegram_link_for). */
  linkFor: (userId: string) => Promise<{ chatId: number } | null>;
  /** Mark the chat's link stopped (telegram_link_stop). */
  stopChat: (chatId: number) => Promise<void>;
  fetchImpl?: FetchLike;
};

export async function sendToUser(userId: string, text: string, deps: SenderDeps): Promise<SendOutcome> {
  try {
    if (!deps.botToken) return "failed";
    const link = await deps.linkFor(userId);
    if (!link) return "not_linked";
    const outcome = await postSendMessage(deps.botToken, link.chatId, text, deps.fetchImpl);
    if (outcome === "blocked") await deps.stopChat(link.chatId);
    return outcome;
  } catch {
    return "failed";
  }
}

/** The production wiring: the service-role client and TELEGRAM_BOT_TOKEN (server-only env). */
export function sendReminder(userId: string, text: string): Promise<SendOutcome> {
  return sendToUser(userId, text, {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    linkFor: async (id) => {
      const { data, error } = await createAdminClient().rpc("telegram_link_for", { p_user_id: id });
      if (error) throw error;
      const row = (data as { chat_id: number }[] | null)?.[0];
      return row ? { chatId: Number(row.chat_id) } : null;
    },
    stopChat: async (chatId) => {
      const { error } = await createAdminClient().rpc("telegram_link_stop", { p_chat_id: chatId });
      if (error) throw error;
    },
  });
}
