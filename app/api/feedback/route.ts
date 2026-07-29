import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { notifyNewFeedback } from "@/lib/feedbackNotify";
import {
  asFeedbackCategory,
  FEEDBACK_CATEGORY_KEYS,
  FEEDBACK_ERRORS,
  FEEDBACK_MAX_LENGTH,
  validateFeedbackMessage,
} from "@/lib/feedback";

/**
 * The metadata half of the payload is triage telemetry, not user-validated
 * input — the same posture as `selectedAnswer` in the reports route. Every
 * field is optional and generously bounded, and anything that fails to parse is
 * DROPPED rather than rejecting the submission: a browser that reports a silly
 * viewport must not cost us the message. `.catch()` per field does exactly that.
 *
 * `message` and `category` are the opposite — those are the report, and a bad
 * one is rejected outright.
 */
const FeedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORY_KEYS as [string, ...string[]]),
  // Bounds are checked below via validateFeedbackMessage() so the client and
  // the server share one rule; the cap here only stops an unbounded body being
  // parsed and re-serialised.
  message: z.string().max(FEEDBACK_MAX_LENGTH * 4),
  route: z.string().max(512).optional().catch(undefined),
  userAgent: z.string().max(1024).optional().catch(undefined),
  viewportWidth: z.number().int().min(0).max(100000).optional().catch(undefined),
  viewportHeight: z.number().int().min(0).max(100000).optional().catch(undefined),
  theme: z.enum(["light", "dark", "system"]).optional().catch(undefined),
  appVersion: z.string().max(64).optional().catch(undefined),
});

/**
 * POST /api/feedback — file a piece of in-app feedback.
 *
 * SIGNED-IN ONLY. Revisit if anonymous play ever ships; until then an
 * unauthenticated caller has no profile row to hang the FK on.
 *
 * VALIDATION IS DELIBERATELY DOUBLED. The dialog checks the length before
 * enabling its button, this route checks it again with the same function, and
 * migration 026 checks it a third time in a CHECK constraint. Only the third
 * one is enforcement — the first two exist to produce a good message instead of
 * a constraint violation.
 *
 * THE RATE LIMIT IS NOT CHECKED HERE, and cannot be: this route queries as the
 * caller, and RLS shows the caller zero feedback rows, so a count from here
 * would always read 0. The cap lives in a BEFORE INSERT trigger (026) that
 * raises SQLSTATE PT429 — which also means it holds for a caller who skips this
 * route entirely and posts straight to PostgREST.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) {
      return NextResponse.json({ error: FEEDBACK_ERRORS.unauthorized }, { status: 401 });
    }

    const json = await req.json().catch(() => null);
    const parsed = FeedbackSchema.safeParse(json);
    if (!parsed.success) {
      // Name the category specifically when that is what's wrong — it is the
      // one field the dialog can highlight — and stay generic otherwise.
      const badCategory = !asFeedbackCategory(
        (json as { category?: unknown } | null)?.category,
      );
      return NextResponse.json(
        {
          error: badCategory ? FEEDBACK_ERRORS.invalidCategory : FEEDBACK_ERRORS.invalidPayload,
          reason: badCategory
            ? "Pick a category."
            : "That submission couldn't be read. Please try again.",
        },
        { status: 400 },
      );
    }
    const body = parsed.data;

    // The shared rule, so the server's complaint is worded exactly like the
    // one the dialog would have shown.
    const invalid = validateFeedbackMessage(body.message);
    if (invalid) {
      return NextResponse.json({ error: invalid.code, reason: invalid.reason }, { status: 400 });
    }

    // No .select() chained on purpose. There is no owner SELECT policy on
    // feedback, so asking for the row back would add a RETURNING clause that
    // RLS refuses and the insert would fail. See the header of migration 026.
    const { error } = await supabase.from("feedback").insert({
      user_id: user.id,
      category: body.category,
      message: body.message.trim(),
      route: body.route ?? null,
      user_agent: body.userAgent ?? null,
      viewport_width: body.viewportWidth ?? null,
      viewport_height: body.viewportHeight ?? null,
      theme: body.theme ?? null,
      app_version: body.appVersion ?? null,
    });

    if (error) {
      // PT429 is raised by the feedback_rate_limit trigger. Matched on the
      // SQLSTATE, never on the message text.
      if (error.code === "PT429") {
        const { data: quota } = await supabase.rpc("feedback_quota");
        const resetsAt =
          quota && typeof quota === "object" && "resets_at" in quota
            ? (quota.resets_at as string | null)
            : null;
        const retryAfterSeconds = resetsAt
          ? Math.max(1, Math.ceil((new Date(resetsAt).getTime() - Date.now()) / 1000))
          : null;

        return NextResponse.json(
          {
            error: FEEDBACK_ERRORS.rateLimited,
            reason:
              "You've sent us several pieces of feedback in the last hour. " +
              "Please try again a little later — nothing you've already sent is lost.",
            resetsAt,
            retryAfterSeconds,
          },
          {
            status: 429,
            // Standard header as well as the JSON, so the browser and any
            // future client get the same answer without parsing a body.
            ...(retryAfterSeconds
              ? { headers: { "Retry-After": String(retryAfterSeconds) } }
              : {}),
          },
        );
      }

      // 23514 is check_violation — one of the length, category or theme
      // constraints, i.e. something got past the checks above. Which one is not
      // worth teasing apart from the message text: report the client error it
      // is rather than a 500, and let the log carry the detail.
      if (error.code === "23514") {
        return NextResponse.json(
          {
            error: FEEDBACK_ERRORS.invalidPayload,
            reason: "That submission can't be saved as written.",
          },
          { status: 400 },
        );
      }

      console.error("feedback insert failed", error);
      return NextResponse.json({ error: FEEDBACK_ERRORS.serverError }, { status: 500 });
    }

    // Announce it AFTER the response. The row is committed and the user is
    // about to be told so; the notification is the operator's convenience and
    // must never be able to delay, fail or alter that. after() runs the
    // callback once the response is finished (on Vercel, via waitUntil), and
    // notifyNewFeedback never rejects — so the worst case is a line in the
    // server log and an operator who has to open the queue themselves.
    after(() =>
      notifyNewFeedback({
        category: body.category,
        message: body.message.trim(),
        route: body.route ?? null,
        submittedBy: user.email,
        userId: user.id,
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: FEEDBACK_ERRORS.serverError }, { status: 500 });
  }
}
