import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { buildExportPayload, exportFilename } from "@/lib/accountExport";

/**
 * GET /api/account/export — the caller's own data, as a downloadable JSON file.
 *
 * SCOPING: every query goes through PostgREST with the caller's own token, so
 * RLS is what actually confines the export to one user. The explicit
 * .eq("user_id", …) filters are belt-and-braces (and keep the owner indexes in
 * play) — never the security boundary. Nothing here uses the service role.
 *
 * SYNCHRONOUS on purpose. This is five indexed, owner-scoped reads over tables
 * that are small per user — notifications self-cap at 50 rows, achievements at
 * the size of the catalogue, and results at one row per quiz taken. There is no
 * join fan-out and no per-row work. Queuing this to a job runner would add a
 * store, a status endpoint and a delivery mechanism to save a few hundred
 * milliseconds. If results ever grow past what one response can carry, the
 * honest fix is pagination or a job — not a bigger timeout.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit BEFORE the reads. Logging the request is what the trigger
    // counts (migration 038); a PT429 from that trigger is the cap tripping.
    // No .select() chained — account_export_log has no owner SELECT policy, so
    // asking for the row back would fail (same as the feedback insert).
    const { error: logError } = await supabase
      .from("account_export_log")
      .insert({ user_id: user.id });
    if (logError) {
      if (logError.code === "PT429") {
        const { data: quota } = await supabase.rpc("account_export_quota");
        const resetsAt =
          quota && typeof quota === "object" && "resets_at" in quota
            ? (quota.resets_at as string | null)
            : null;
        const retryAfterSeconds = resetsAt
          ? Math.max(1, Math.ceil((new Date(resetsAt).getTime() - Date.now()) / 1000))
          : null;
        return NextResponse.json(
          {
            error:
              "You've exported your data several times in the last hour. " +
              "Please try again a little later.",
            retryAfterSeconds,
          },
          {
            status: 429,
            ...(retryAfterSeconds
              ? { headers: { "Retry-After": String(retryAfterSeconds) } }
              : {}),
          },
        );
      }
      console.error("account export log insert failed", logError);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const [profileRes, resultsRes, achievementsRes, membershipsRes, duelsRes, lessonAttemptsRes, acquisitionRes] =
      await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id, display_name, full_name, city, avatar_url, role, is_author, total_xp, current_streak, longest_streak, last_quiz_at, leaderboard_opt_out, created_at",
          )
          .eq("id", user.id)
          .single(),
        supabase
          .from("results")
          .select(
            "id, quiz_id, mode, score, total_questions, correct, tag_breakdown, wrong_question_ids, grading_type, time_taken, taken_at",
          )
          .eq("user_id", user.id)
          .order("taken_at", { ascending: false }),
        supabase
          .from("user_achievements")
          .select("achievement_id, unlocked_at")
          .eq("user_id", user.id)
          .order("unlocked_at", { ascending: false }),
        supabase
          .from("group_members")
          .select("group_id, role, created_at, groups(name, description, created_at)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase.rpc("get_my_duels"),
        supabase
          .from("lesson_attempts")
          .select("id, lesson_version_id, block_id, earned, possible, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("signup_acquisitions")
          .select("course_id, source, created_at, courses(slug, title)")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

    // A partial export is worse than none: the user would have no way to tell a
    // genuinely empty section from a section that failed to load.
    const failed = [profileRes, resultsRes, achievementsRes, membershipsRes, duelsRes, lessonAttemptsRes, acquisitionRes]
      .find(r => r.error);
    if (failed?.error) {
      return NextResponse.json({ error: failed.error.message }, { status: 500 });
    }

    const now = new Date();
    const payload = buildExportPayload(
      {
        accountId: user.id,
        email: user.email,
        exportedAt: now,
        profile: profileRes.data ?? null,
        results: resultsRes.data ?? [],
        achievements: achievementsRes.data ?? [],
        memberships: membershipsRes.data ?? [],
        duels: duelsRes.data ?? [],
        lessonAttempts: lessonAttemptsRes.data ?? [],
        signupAcquisition: acquisitionRes.data ?? null,
      },
      ACHIEVEMENTS,
    );

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(now)}"`,
        // Personal data: never let a shared cache or the browser keep a copy.
        "Cache-Control": "no-store, private",
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
