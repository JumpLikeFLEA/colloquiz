// Outbound notification for new feedback.
//
// WHY A DISCORD WEBHOOK AND NOT RESEND. Resend is already configured for this
// project, but it is configured INSIDE SUPABASE, as the custom SMTP provider
// for Auth's confirmation and recovery mail. That gives the application itself
// nothing: there is no RESEND_API_KEY in the environment, no `resend`
// dependency, and no verified sending domain registered against an API key
// (SMTP credentials are not an API key). Sending from the app would mean adding
// all three, plus a from-address and a deliverability story, to deliver one
// line of text to one person. A Discord webhook is a URL and a POST — no
// dependency, no key management, no domain verification, and it lands where an
// operator already gets notifications. If this ever needs to reach people who
// are not in the Discord, email becomes the right answer and this module is the
// seam to swap.
//
// NOTHING HERE MAY THROW. It runs from after() in the feedback route, once the
// user has already been told their feedback was stored. A failure at this point
// cannot be shown to them and must not be able to fail anything — see
// notifyNewFeedback below.

/** Name of the env var, referenced in .env.example and in the failure log. */
export const FEEDBACK_WEBHOOK_ENV = "FEEDBACK_DISCORD_WEBHOOK_URL";

export type FeedbackNotification = {
  category: string;
  message: string;
  /** The page the sender was on, if the client captured one. */
  route: string | null;
  /** Email from the caller's JWT — the cheapest unambiguous identifier. */
  submittedBy: string | null;
  userId: string;
};

/** Discord embed colours, roughly matching the category pills in the admin queue. */
const CATEGORY_COLOR: Record<string, number> = {
  bug: 0xe11d48,
  idea: 0x8b5cf6,
  other: 0x71717a,
};

// Discord's documented ceilings. Our own validation already caps a message at
// 2000 characters and a route at 512, so these only bite if those change.
const MAX_DESCRIPTION = 4000;
const MAX_FIELD = 1000;

const clamp = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

/**
 * The Discord webhook body for one piece of feedback.
 *
 * Pure and exported so the shape can be checked without a network call — the
 * same split as buildExportPayload() in lib/accountExport.ts.
 *
 * `allowed_mentions: { parse: [] }` is deliberate and is the only piece of
 * hardening here: the message is arbitrary text written by a user, and this
 * guarantees that an "@everyone" in it can never ping a server. Everything else
 * a user could write is at worst cosmetic markdown.
 */
export function buildDiscordPayload(n: FeedbackNotification) {
  return {
    username: "Colloquiz feedback",
    allowed_mentions: { parse: [] as string[] },
    embeds: [
      {
        title: `New ${n.category} feedback`,
        description: clamp(n.message, MAX_DESCRIPTION),
        color: CATEGORY_COLOR[n.category] ?? CATEGORY_COLOR.other,
        fields: [
          {
            name: "Category",
            value: n.category,
            inline: true,
          },
          {
            name: "From",
            value: clamp(n.submittedBy || n.userId, MAX_FIELD),
            inline: true,
          },
          {
            name: "Route",
            // Backticks so a path with underscores is not eaten by markdown.
            value: n.route ? `\`${clamp(n.route, MAX_FIELD - 2)}\`` : "—",
            inline: false,
          },
        ],
        footer: { text: `user ${n.userId}` },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

// Logged once per process rather than once per submission: an unconfigured
// webhook is a normal state (local dev, a fork, a preview deploy), not an
// incident, and repeating it on every insert would bury real failures.
let warnedMissing = false;

/**
 * Fire the notification. Resolves — never rejects — whatever happens.
 *
 * The caller is after(), so by the time this runs the response is already sent
 * and the row is already committed. There is no one to tell about a failure and
 * nothing useful to do about it, so every outcome that is not success is a
 * console.error and nothing more. That is the whole contract: the user's
 * feedback is stored either way, and a broken webhook is the operator's problem.
 */
export async function notifyNewFeedback(n: FeedbackNotification): Promise<void> {
  const url = process.env[FEEDBACK_WEBHOOK_ENV];
  if (!url) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn(
        `[feedback] ${FEEDBACK_WEBHOOK_ENV} is not set — feedback is being stored but not announced.`,
      );
    }
    return;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDiscordPayload(n)),
      // Without this a webhook host that accepts the connection and then hangs
      // would keep the invocation alive to the route's max duration.
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      // Read a little of the body: Discord explains refusals (bad token,
      // rate limit) in JSON, and the status alone is rarely enough to fix it.
      const detail = await res.text().catch(() => "");
      console.error(
        `[feedback] webhook rejected the notification: ${res.status} ${res.statusText} ${detail.slice(0, 300)}`,
      );
    }
  } catch (e) {
    // Covers DNS failure, refused connection, TLS error, timeout and a malformed
    // URL alike. The feedback is already stored; this is informational only.
    console.error("[feedback] could not reach the notification webhook:", e);
  }
}
