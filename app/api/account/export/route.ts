import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { buildExportPayload, exportFilename, type AuthorSeatExportRow, type CalendarFeedExportRow, type TelegramLinkExportRow, type VoiceSubmissionRow } from "@/lib/accountExport";
import { VOICE_BUCKET } from "@/lib/voice/recording";

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

    const [profileRes, resultsRes, achievementsRes, membershipsRes, duelsRes, lessonAttemptsRes, acquisitionRes, lessonOpensRes, entitlementsRes, enrolmentsRes, invitesRes, voiceRes, finalCommentsRes, teacherLinksRes, teacherGroupsRes, conversationsRes, homeworkRes, authorSeatRes, calendarFeedRes, telegramLinkRes] =
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
          .select("id, lesson_version_id, block_id, earned, possible, response, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("signup_acquisitions")
          .select("course_id, source, created_at, courses(slug, title)")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("lesson_opens")
          .select("lesson_id, first_opened_at, last_opened_at, lessons(slug, title, courses(slug, title))")
          .eq("user_id", user.id)
          .order("last_opened_at", { ascending: false }),
        supabase
          .from("course_entitlements")
          .select("course_id, granted_at, source, source_ref, revoked_at, courses(slug, title)")
          .eq("user_id", user.id)
          .order("granted_at", { ascending: false }),
        supabase
          .from("run_enrolments")
          .select("id, run_id, tier, enrolled_at, revoked_at, course_runs(title, starts_at, ends_at, courses(slug, title))")
          .eq("user_id", user.id)
          .order("enrolled_at", { ascending: false }),
        // COH-003: run_invites has no grants; this function returns the
        // caller's own claimed invites only (059).
        supabase.rpc("my_claimed_run_invites"),
        // VOICE-004: own takes, and only PUBLISHED feedback (060's policies).
        supabase
          .from("voice_submissions")
          .select(
            "id, lesson_id, block_id, lesson_version_id, object_name, content_type, size_bytes, submitted_at, purged_at, lessons(slug, title, courses(slug, title)), voice_feedback(body, published_at, updated_at)",
          )
          .eq("user_id", user.id)
          .order("submitted_at", { ascending: false }),
        // COH-008: the author's final comment per enrolment, PUBLISHED only
        // (061's owner policy; the filter also keeps an editor's own drafts out).
        supabase
          .from("run_final_comments")
          .select("enrolment_id, run_id, body, published_at, updated_at, course_runs(title, starts_at, ends_at), courses(slug, title)")
          .eq("user_id", user.id)
          .not("published_at", "is", null)
          .order("published_at", { ascending: false }),
        // TCH-001: links the caller is the student in, ended ones too (076).
        supabase.rpc("my_teacher_links"),
        // TCH-002: names of the groups a teacher put the caller in (077).
        supabase.rpc("my_group_memberships"),
        // TCH-004: conversations the caller is the student in (079).
        supabase.rpc("my_conversations_export"),
        // TCH-005: homework that applies to the caller (080).
        supabase.rpc("my_homework_export"),
        // TCH-007: the caller's own author seat, if any (082).
        supabase.rpc("my_author_seat_export"),
        // COH-016: whether the caller has a calendar feed address (086). Never the address.
        supabase.rpc("calendar_feed_status"),
        // COH-010: the caller's own Telegram reminders link, if any (090).
        supabase.rpc("my_telegram_link"),
      ]);

    // A partial export is worse than none: the user would have no way to tell a
    // genuinely empty section from a section that failed to load.
    const failed = [profileRes, resultsRes, achievementsRes, membershipsRes, duelsRes, lessonAttemptsRes, acquisitionRes, lessonOpensRes, entitlementsRes, enrolmentsRes, invitesRes, voiceRes, finalCommentsRes, teacherLinksRes, teacherGroupsRes, conversationsRes, homeworkRes, authorSeatRes, calendarFeedRes, telegramLinkRes]
      .find(r => r.error);
    if (failed?.error) {
      return NextResponse.json({ error: failed.error.message }, { status: 500 });
    }

    // A copy of each take's audio (privacy-policy.md section 8), downloaded
    // under the caller's own session: the bucket's SELECT policy is the
    // boundary, as RLS is for the rows. One at a time, to bound memory; a
    // learner has a handful of takes per run. A failed download fails the
    // export, for the same reason a failed section does.
    const voiceRows = (voiceRes.data ?? []) as (VoiceSubmissionRow & { object_name: string | null })[];
    const voiceAudio: Record<string, string> = {};
    for (const row of voiceRows) {
      if (!row.object_name) continue;
      const { data: blob, error: dlError } = await supabase.storage.from(VOICE_BUCKET).download(row.object_name);
      if (dlError || !blob) {
        return NextResponse.json({ error: "Could not copy a voice recording." }, { status: 500 });
      }
      voiceAudio[row.id] = Buffer.from(await blob.arrayBuffer()).toString("base64");
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
        lessonOpens: lessonOpensRes.data ?? [],
        courseEntitlements: entitlementsRes.data ?? [],
        runEnrolments: enrolmentsRes.data ?? [],
        claimedInvites: invitesRes.data ?? [],
        voiceSubmissions: voiceRows,
        voiceAudio,
        finalComments: finalCommentsRes.data ?? [],
        teacherLinks: teacherLinksRes.data ?? [],
        teacherGroups: teacherGroupsRes.data ?? [],
        conversations: conversationsRes.data ?? [],
        homework: homeworkRes.data ?? [],
        authorSeat: ((authorSeatRes.data ?? []) as AuthorSeatExportRow[])[0] ?? null,
        calendarFeed: ((calendarFeedRes.data ?? []) as CalendarFeedExportRow[])[0] ?? null,
        telegramLink: ((telegramLinkRes.data ?? []) as TelegramLinkExportRow[])[0] ?? null,
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
