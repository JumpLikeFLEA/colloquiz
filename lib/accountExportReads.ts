import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllPages } from "@/lib/pagedRead";
import type { ClaimedInviteRow, ConversationExportRow, GroupMembershipRow, HomeworkExportRow, TeacherLinkRow, VoiceAnalysisExportRow } from "@/lib/accountExport";

/**
 * The account export's reads (moved from app/api/account/export/route.ts, OPS-044,
 * docs/decisions/0250), so the route and scripts/account-export-local-run.ts run the same code.
 * Not pure: it talks to PostgREST through the client it is given, which must carry the caller's
 * own session. RLS is the boundary; the user_id filters are belt-and-braces, as before.
 *
 * Every read that returns a set goes through readAllPages: PostgREST cuts a response at
 * max_rows (1,000) without an error, which cut an account with 1,005 lesson attempts to 1,000
 * (0250 "Reproduced"). Each paged read is ordered by its old sort column, then by a column that
 * is unique per row for this user (the tiebreak), so a page boundary inside a run of equal
 * timestamps neither loses nor repeats a row. my_group_memberships() returns no unique column,
 * so it is ordered by every column it returns: rows that tie are then identical in every field,
 * and the paged result is the same list (0250 Decision 3).
 *
 * Single-row reads (.single(), .maybeSingle(), one row per user by primary key) and
 * my_notebook() (one JSONB value) cannot be cut and are not paged.
 */
export async function readAccountExportSections(supabase: SupabaseClient, userId: string) {
  const [profileRes, resultsRes, achievementsRes, membershipsRes, duelsRes, lessonAttemptsRes, acquisitionRes, lessonOpensRes, entitlementsRes, enrolmentsRes, invitesRes, voiceRes, finalCommentsRes, teacherLinksRes, teacherGroupsRes, conversationsRes, homeworkRes, authorSeatRes, calendarFeedRes, telegramLinkRes, voiceAnalysesRes, writingRes, notebookRes] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, display_name, full_name, city, avatar_url, role, is_author, total_xp, current_streak, longest_streak, last_quiz_at, leaderboard_opt_out, created_at",
        )
        .eq("id", userId)
        .single(),
      readAllPages((from, to) =>
        supabase
          .from("results")
          .select(
            "id, quiz_id, mode, score, total_questions, correct, tag_breakdown, wrong_question_ids, grading_type, time_taken, taken_at",
          )
          .eq("user_id", userId)
          .order("taken_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      ),
      readAllPages((from, to) =>
        supabase
          .from("user_achievements")
          .select("achievement_id, unlocked_at")
          .eq("user_id", userId)
          .order("unlocked_at", { ascending: false })
          .order("achievement_id", { ascending: true })
          .range(from, to),
      ),
      readAllPages((from, to) =>
        supabase
          .from("group_members")
          .select("group_id, role, created_at, groups(name, description, created_at)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .order("group_id", { ascending: true })
          .range(from, to),
      ),
      readAllPages((from, to) =>
        supabase
          .rpc("get_my_duels")
          .order("created_at", { ascending: false })
          .order("duel_id", { ascending: true })
          .range(from, to),
      ),
      readAllPages((from, to) =>
        supabase
          .from("lesson_attempts")
          .select("id, lesson_version_id, block_id, earned, possible, response, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      ),
      supabase
        .from("signup_acquisitions")
        .select("course_id, source, created_at, courses(slug, title)")
        .eq("user_id", userId)
        .maybeSingle(),
      readAllPages((from, to) =>
        supabase
          .from("lesson_opens")
          .select("lesson_id, first_opened_at, last_opened_at, lessons(slug, title, courses(slug, title))")
          .eq("user_id", userId)
          .order("last_opened_at", { ascending: false })
          .order("lesson_id", { ascending: true })
          .range(from, to),
      ),
      readAllPages((from, to) =>
        supabase
          .from("course_entitlements")
          .select("course_id, granted_at, source, source_ref, revoked_at, courses(slug, title)")
          .eq("user_id", userId)
          .order("granted_at", { ascending: false })
          .order("course_id", { ascending: true })
          .range(from, to),
      ),
      readAllPages((from, to) =>
        supabase
          .from("run_enrolments")
          .select("id, run_id, tier, enrolled_at, revoked_at, course_runs(title, starts_at, ends_at, courses(slug, title))")
          .eq("user_id", userId)
          .order("enrolled_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      // COH-003: run_invites has no grants; this function returns the
      // caller's own claimed invites only (059).
      readAllPages<ClaimedInviteRow>((from, to) =>
        supabase
          .rpc("my_claimed_run_invites")
          .order("claimed_at", { ascending: false })
          .order("invite_id", { ascending: true })
          .range(from, to),
      ),
      // VOICE-004: own takes, and only PUBLISHED feedback (060's policies).
      readAllPages((from, to) =>
        supabase
          .from("voice_submissions")
          .select(
            "id, lesson_id, block_id, lesson_version_id, object_name, content_type, size_bytes, submitted_at, purged_at, lessons(slug, title, courses(slug, title)), voice_feedback(body, published_at, updated_at)",
          )
          .eq("user_id", userId)
          .order("submitted_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      // COH-008: the author's final comment per enrolment, PUBLISHED only
      // (061's owner policy; the filter also keeps an editor's own drafts out).
      readAllPages((from, to) =>
        supabase
          .from("run_final_comments")
          .select("enrolment_id, run_id, body, published_at, updated_at, course_runs(title, starts_at, ends_at), courses(slug, title)")
          .eq("user_id", userId)
          .not("published_at", "is", null)
          .order("published_at", { ascending: false })
          .order("enrolment_id", { ascending: true })
          .range(from, to),
      ),
      // TCH-001: links the caller is the student in, ended ones too (076).
      readAllPages<TeacherLinkRow>((from, to) =>
        supabase
          .rpc("my_teacher_links")
          .order("linked_at", { ascending: false })
          .order("link_id", { ascending: true })
          .range(from, to),
      ),
      // TCH-002: names of the groups a teacher put the caller in (077). No unique column:
      // ordered by all three (0250 Decision 3).
      readAllPages<GroupMembershipRow>((from, to) =>
        supabase
          .rpc("my_group_memberships")
          .order("added_at", { ascending: false })
          .order("group_name", { ascending: true })
          .order("teacher_name", { ascending: true })
          .range(from, to),
      ),
      // TCH-004: conversations the caller is the student in, one row per message (079).
      readAllPages<ConversationExportRow>((from, to) =>
        supabase
          .rpc("my_conversations_export")
          .order("conversation_id", { ascending: true })
          .order("created_at", { ascending: true })
          .order("message_id", { ascending: true })
          .range(from, to),
      ),
      // TCH-005: homework that applies to the caller, one row per assignment (080).
      readAllPages<HomeworkExportRow>((from, to) =>
        supabase
          .rpc("my_homework_export")
          .order("assigned_at", { ascending: false })
          .order("assignment_id", { ascending: true })
          .range(from, to),
      ),
      // TCH-007: the caller's own author seat, if any (082). One row at most (PK user_id).
      supabase.rpc("my_author_seat_export"),
      // COH-016: whether the caller has a calendar feed address (086). Never the address. One row.
      supabase.rpc("calendar_feed_status"),
      // COH-010: the caller's own Telegram reminders link, if any (090). One row at most (PK user_id).
      supabase.rpc("my_telegram_link"),
      // VOICE-016: the caller's own transcripts and AI analyses, withdrawn ones too (098).
      readAllPages<VoiceAnalysisExportRow>((from, to) =>
        supabase
          .rpc("my_voice_analyses_export")
          .order("created_at", { ascending: false })
          .order("submission_id", { ascending: true })
          .range(from, to),
      ),
      // WRITE-005: own written answers, and only PUBLISHED feedback (109's policies). Strict like
      // every other section, so this ships only once 109 is on hosted (0225 Decision 14).
      readAllPages((from, to) =>
        supabase
          .from("writing_submissions")
          .select(
            "id, lesson_id, block_id, lesson_version_id, enrolment_id, body, submitted_at, updated_at, lessons(slug, title), courses(slug, title), writing_feedback(body, published_at, updated_at)",
          )
          .eq("user_id", userId)
          .order("submitted_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      // PROG-012: the caller's notebook, one JSON value (112). Strict like every other section,
      // so this ships only once 112 is on hosted.
      supabase.rpc("my_notebook"),
    ]);

  // A partial export is worse than none: the user would have no way to tell a
  // genuinely empty section from a section that failed to load.
  const failed = [profileRes, resultsRes, achievementsRes, membershipsRes, duelsRes, lessonAttemptsRes, acquisitionRes, lessonOpensRes, entitlementsRes, enrolmentsRes, invitesRes, voiceRes, finalCommentsRes, teacherLinksRes, teacherGroupsRes, conversationsRes, homeworkRes, authorSeatRes, calendarFeedRes, telegramLinkRes, voiceAnalysesRes, writingRes, notebookRes]
    .find(r => r.error);
  if (failed?.error) return { ok: false as const, message: failed.error.message };

  return {
    ok: true as const,
    profileRes, resultsRes, achievementsRes, membershipsRes, duelsRes, lessonAttemptsRes, acquisitionRes, lessonOpensRes, entitlementsRes, enrolmentsRes, invitesRes, voiceRes, finalCommentsRes, teacherLinksRes, teacherGroupsRes, conversationsRes, homeworkRes, authorSeatRes, calendarFeedRes, telegramLinkRes, voiceAnalysesRes, writingRes, notebookRes,
  };
}
