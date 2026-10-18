import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseTelegramLang } from "@/lib/telegram/messages";
import { postSendMessage } from "@/lib/telegram/send";
import { handleUpdate, isValidWebhookSecret } from "@/lib/telegram/webhook";

/**
 * POST /api/telegram/webhook — the bot's updates (COH-010, docs/decisions/0173).
 *
 * Telegram sends `X-Telegram-Bot-Api-Secret-Token` with the `secret_token` the
 * owner gave setWebhook; anything without it is refused before the body is read
 * (the secret is the only credential, and an unset TELEGRAM_WEBHOOK_SECRET refuses
 * everything). Past that check the route always answers 200: Telegram retries a
 * non-2xx update, and a retry of a half-done /start would only repeat the error.
 * `/start <token>` links the sender's chat, `/stop` turns reminders off, anything
 * else gets a short help reply (lib/telegram/webhook.ts). The service-role client
 * is used because the caller is Telegram, not a signed-in user; the effects are
 * the service_role-only functions of migration 090.
 */
export async function POST(request: NextRequest) {
  if (!isValidWebhookSecret(request.headers.get("x-telegram-bot-api-secret-token"), process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("telegram webhook: TELEGRAM_BOT_TOKEN is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    await handleUpdate(update, {
      claim: async (token, chatId) => {
        const { data, error } = await admin.rpc("telegram_link_claim", { p_token: token, p_chat_id: chatId });
        if (error) throw error;
        const result = data as { ok?: boolean; lang?: string } | null;
        return result?.ok ? parseTelegramLang(result.lang) : null;
      },
      stop: async (chatId) => {
        const { data, error } = await admin.rpc("telegram_link_stop", { p_chat_id: chatId });
        if (error) throw error;
        return typeof data === "string" ? parseTelegramLang(data) : null;
      },
      reply: async (chatId, text) => {
        const outcome = await postSendMessage(botToken, chatId, text);
        if (outcome === "failed") console.error("telegram webhook: reply not sent");
      },
    });
  } catch (e) {
    // Never the update's content: it can carry a link token.
    console.error("telegram webhook failed", e instanceof Error ? e.message : "unknown");
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
