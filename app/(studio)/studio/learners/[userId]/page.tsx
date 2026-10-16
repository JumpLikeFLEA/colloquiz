import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCourseAccess } from "@/lib/courseAccess";
import { createClient } from "@/lib/supabase/server";
import { InlineContentSchema } from "@/lib/lessons/inline";
import { inlinePlainText } from "@/lib/lessons/plainText";
import { toRosterRow } from "@/lib/learners/roster";
import {
  groupLessonsByCourse,
  groupRecordings,
  parseLearnerId,
  toLessonActivityRow,
  toRecordingRow,
} from "@/lib/learners/detail";
import { learnerLabel, reviewFiltersQuery } from "@/lib/reviews/queue";
import { signVoicePlaybackUrl } from "@/lib/voice/storage";
import { LocalTime, LocalTimeZone } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import { getLinkedStudents } from "@/lib/teacherLinksServer";
import { getGroupMemberRows, getTeacherGroups } from "@/lib/teacherGroupsServer";
import { groupsByStudent } from "@/lib/teacherGroups";
import { LearnerGroups } from "./LearnerGroups";
import { LessonActivityCard } from "./LessonActivityCard";
import { RecordingItem, type RecordingItemRow } from "./RecordingItem";

// /studio/learners/[userId] — one learner (AUTH-013, docs/decisions/0109
// Decisions 8 and 13, 0119). Who may see which learner is decided in SQL:
// learner_roster() (063), learner_lessons() and learner_recordings() (064)
// return rows only for courses the caller edits where this account is a
// learner. No rows from any of them is a 404, the same page an unknown id
// gets, so an editor of another course learns nothing. getCourseAccess()
// is the page gate (the Studio layout's too), not the data boundary.

export const metadata = { title: "Learner" };

const SOURCE_LABEL = { instagram: "Instagram", telegram: "Telegram", direct: "Direct link" } as const;

export default async function LearnerPage({ params }: { params: Promise<{ userId: string }> }) {
  const { isAdmin, editableCourseIds } = await getCourseAccess();
  if (!isAdmin && editableCourseIds.length === 0) notFound();

  const userId = parseLearnerId((await params).userId);
  if (!userId) notFound();

  const supabase = await createClient();
  const [roster, lessons, recordings, linkedStudents, teacherGroups, memberRows] = await Promise.all([
    supabase.rpc("learner_roster"),
    supabase.rpc("learner_lessons", { p_user_id: userId }),
    supabase.rpc("learner_recordings", { p_user_id: userId }),
    getLinkedStudents(),
    getTeacherGroups(),
    getGroupMemberRows(),
  ]);
  // TCH-002: grouping applies to students linked to the caller only.
  const isLinked = linkedStudents.some((s) => s.userId === userId);
  const memberOf = [...(groupsByStudent(memberRows).get(userId) ?? [])];
  if (roster.error) throw new Error(roster.error.message);
  if (lessons.error) throw new Error(lessons.error.message);
  if (recordings.error) throw new Error(recordings.error.message);

  const rosterRows = ((roster.data ?? []) as Record<string, unknown>[])
    .map(toRosterRow)
    .filter((r) => r.userId === userId);
  const lessonRows = ((lessons.data ?? []) as Record<string, unknown>[]).map(toLessonActivityRow);
  const takeRows = ((recordings.data ?? []) as Record<string, unknown>[]).map(toRecordingRow);
  if (rosterRows.length === 0 && lessonRows.length === 0 && takeRows.length === 0) notFound();

  // Sign the takes under the editor's own session: the bucket's SELECT
  // policy (060) is what lets an editor of the course hear them.
  const ids = takeRows.filter((r) => !r.recordingRemoved).map((r) => r.submissionId);
  const objectNames = new Map<string, string>();
  if (ids.length > 0) {
    const { data, error } = await supabase.from("voice_submissions").select("id, object_name").in("id", ids);
    if (error) throw new Error(error.message);
    for (const s of data ?? []) if (s.object_name) objectNames.set(s.id, s.object_name);
  }
  const items = new Map<string, RecordingItemRow>();
  await Promise.all(
    takeRows.map(async (r) => {
      const name = objectNames.get(r.submissionId);
      const signed = name ? await signVoicePlaybackUrl(supabase, name) : null;
      const prompt = InlineContentSchema.safeParse(r.blockPrompt);
      items.set(r.submissionId, {
        ...r,
        promptText: prompt.success ? inlinePlainText(prompt.data) : "",
        playbackUrl: signed?.url ?? null,
      });
    }),
  );
  const item = (r: { submissionId: string }) => items.get(r.submissionId)!;

  const courses = groupLessonsByCourse(lessonRows);
  const enrolments = groupRecordings(takeRows);

  const head = rosterRows[0];
  const email = head?.learnerEmail ?? null;
  const label = head ? learnerLabel(rosterRows.find((r) => r.inviteeName) ?? head) : "Learner";
  const contacts = [...new Set(rosterRows.map((r) => r.inviteeContact).filter((c): c is string => !!c))];
  const acquisition = rosterRows.find((r) => r.acquisitionSource) ?? null;
  const lastActive = rosterRows
    .map((r) => r.lastActivityAt)
    .filter((t): t is string => !!t)
    .sort()
    .at(-1);
  const enrolmentRows = rosterRows.filter((r) => r.enrolmentId);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="space-y-3">
        <Link
          href="/studio/learners"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={12} aria-hidden />
          Learners
        </Link>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground break-all">{label}</h1>
          {(label !== email || contacts.length > 0) && (
            <p className="text-sm text-muted-foreground break-all">
              {[label !== email ? email : null, ...contacts].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Came from:{" "}
            {acquisition?.acquisitionSource ? (
              <>
                {SOURCE_LABEL[acquisition.acquisitionSource]}
                {acquisition.acquisitionCourseTitle && <> · {acquisition.acquisitionCourseTitle}</>}
              </>
            ) : (
              "not recorded"
            )}
            {" · "}Last active: {lastActive ? <LocalTime iso={lastActive} /> : "—"}
          </p>
          {enrolmentRows.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {enrolmentRows.map((r) => (
                <span
                  key={r.enrolmentId}
                  className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                >
                  {r.courseTitle} · {r.runTitle || "Untitled run"} · {r.tier === "extended" ? "Extended" : "Basic"}
                  {r.enrolmentRevokedAt && " · Revoked"}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground pt-1">
            Only the courses you edit. Times are in your timezone (<LocalTimeZone />).
          </p>
        </div>
      </div>

      {isLinked && (
        <LearnerGroups
          studentId={userId}
          groups={teacherGroups.map((g) => ({ id: g.id, name: g.name }))}
          memberOf={memberOf}
        />
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Lessons</h2>
        {courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4">
            No published lessons in this learner&apos;s courses yet.
          </div>
        ) : (
          <div className="space-y-3">
            {courses.map((c) => (
              <LessonActivityCard key={c.courseId} course={c} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          Recordings <span className="text-muted-foreground font-normal">({takeRows.length})</span>
        </h2>
        {enrolments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4">
            No recordings sent.
          </div>
        ) : (
          <div className="space-y-3">
            {enrolments.map((e) => (
              <article key={e.enrolmentId} className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    {e.courseTitle} · {e.runTitle || "Untitled run"}
                  </h3>
                  {e.revokedAt && (
                    <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-muted text-muted-foreground">
                      Revoked
                    </span>
                  )}
                  <Link
                    href={`/studio/reviews${reviewFiltersQuery({ course: e.courseId, run: e.runId, status: "all" })}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors sm:ml-auto"
                  >
                    Write feedback in Reviews
                  </Link>
                </div>

                {e.beforeAfter && (
                  <div className="border-t border-border px-4 py-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Before and after</p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {(["before", "after"] as const).map((slot) => {
                        const r = e.beforeAfter![slot];
                        const heading = slot === "before" ? "Before" : "After";
                        return r ? (
                          <div key={slot} className="rounded-xl border border-border p-3 min-w-0">
                            <RecordingItem row={item(r)} heading={heading} />
                          </div>
                        ) : (
                          <div key={slot} className="rounded-xl border border-dashed border-border p-3 space-y-2">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-subtle text-brand-text">
                              {heading}
                            </span>
                            <p className="text-sm text-muted-foreground">Not sent yet.</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {e.weekly.map((r) => (
                  <div key={r.submissionId} className="border-t border-border px-4 py-3">
                    <RecordingItem row={item(r)} />
                  </div>
                ))}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
