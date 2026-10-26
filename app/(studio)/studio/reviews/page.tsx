import { notFound } from "next/navigation";
import { canEnterStudio, getCourseAccess } from "@/lib/courseAccess";
import { createClient } from "@/lib/supabase/server";
import { InlineContentSchema } from "@/lib/lessons/inline";
import { inlinePlainText } from "@/lib/lessons/plainText";
import {
  filterOptions,
  matchesStatus,
  parseReviewFilters,
  scopeRows,
  statusGrid,
  toFinalCommentRow,
  toReviewRow,
} from "@/lib/reviews/queue";
import { signVoicePlaybackUrl } from "@/lib/voice/storage";
import { readAnalyses } from "@/lib/voice/analysis/studioRead";
import { LocalTimeZone } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import { RecordingsTabs } from "../RecordingsTabs";
import { FinalCommentCard } from "./FinalCommentCard";
import { RecordingCard, type RecordingCardRow } from "./RecordingCard";
import { ReviewFilters } from "./ReviewFilters";
import { StatusGridTable } from "./StatusGridTable";
import { STATUS_FILTER_LABEL } from "./statusLabels";

// /studio/reviews — the one review queue (VOICE-006, docs/decisions/0109
// Decision 7, 0114). Who may see which row is decided in SQL:
// review_queue() and review_final_comments() (062) return only courses the
// caller edits (can_edit_course), and every save goes through 060/061's
// RPCs, which check it again. getCourseAccess() here is the page gate
// (the Studio layout's too), not the data boundary.
//
// The page reads the queue unfiltered and narrows it with lib/reviews:
// the filter menus and the learner × week table need more than the
// filtered list, and the queue is one cohort's worth of rows, not a feed.

export const metadata = { title: "Teacher review" };

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await getCourseAccess();
  if (!canEnterStudio(access)) notFound();

  const filters = parseReviewFilters(await searchParams);
  const supabase = await createClient();
  const [queue, comments] = await Promise.all([supabase.rpc("review_queue"), supabase.rpc("review_final_comments")]);
  if (queue.error) throw new Error(queue.error.message);
  if (comments.error) throw new Error(comments.error.message);

  const allRows = ((queue.data ?? []) as Record<string, unknown>[]).map(toReviewRow);
  const options = filterOptions(allRows, filters.course);
  const scoped = scopeRows(allRows, filters);
  const listed = scoped.filter((r) => matchesStatus(r.status, filters.status));
  const grid = statusGrid(scoped);
  const finalComments = scopeRows(
    ((comments.data ?? []) as Record<string, unknown>[]).map(toFinalCommentRow),
    { course: filters.course, run: filters.run, week: null },
  );

  // Sign the listed takes under the editor's own session: the bucket's
  // SELECT policy (060) is what lets an editor of the course hear them.
  const ids = listed.filter((r) => r.submissionId && !r.recordingRemoved).map((r) => r.submissionId!);
  const objectNames = new Map<string, string>();
  if (ids.length > 0) {
    const { data, error } = await supabase.from("voice_submissions").select("id, object_name").in("id", ids);
    if (error) throw new Error(error.message);
    for (const s of data ?? []) if (s.object_name) objectNames.set(s.id, s.object_name);
  }
  // VOICE-015: the AI analysis of each listed take, beside the written-feedback box. A read only:
  // the queue, its statuses and the feedback lock are decided by review_queue() as before.
  const analyses = await readAnalyses(supabase, ids);
  const cards: RecordingCardRow[] = await Promise.all(
    listed.map(async (r) => {
      const name = r.submissionId ? objectNames.get(r.submissionId) : undefined;
      const signed = name ? await signVoicePlaybackUrl(supabase, name) : null;
      const prompt = InlineContentSchema.safeParse(r.blockPrompt);
      return {
        ...r,
        promptText: prompt.success ? inlinePlainText(prompt.data) : "",
        playbackUrl: signed?.url ?? null,
        analysis: (r.submissionId && analyses.get(r.submissionId)) || null,
      };
    }),
  );

  const noCohorts = allRows.length === 0 && finalComments.length === 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="space-y-3">
        <RecordingsTabs tab="reviews" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Teacher review</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Learners&apos; voice recordings, your feedback, and each learner&apos;s final comment.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Times are in your timezone (<LocalTimeZone />).
          </p>
        </div>
        {!noCohorts && <ReviewFilters filters={filters} options={options} />}
      </div>

      {noCohorts ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4">
          Nobody is enrolled in a run of a course you edit yet. Recordings appear here once learners join a run.
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              Recordings{" "}
              <span className="text-muted-foreground font-normal">
                ({STATUS_FILTER_LABEL[filters.status]}: {cards.length})
              </span>
            </h2>
            {cards.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4">
                {filters.status === "to_review" ? "Nothing waiting for feedback." : "Nothing matches these filters."}
              </div>
            ) : (
              <div className="space-y-3">
                {cards.map((row) => (
                  <RecordingCard key={`${row.enrolmentId}:${row.lessonId}:${row.blockId}`} row={row} />
                ))}
              </div>
            )}
          </section>

          {grid.learners.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Status by learner and week</h2>
              <StatusGridTable grid={grid} />
            </section>
          )}

          {/* The inbox's final-comment drafts link here (AUTH-012). */}
          <section id="final-comments" className="space-y-3 scroll-mt-4">
            <h2 className="text-sm font-semibold text-foreground">
              Final comments <span className="text-muted-foreground font-normal">({finalComments.length})</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              One per learner per run, shown on their final screen next to the before and after recordings.
            </p>
            {finalComments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4">
                No learners in this selection.
              </div>
            ) : (
              <div className="space-y-2">
                {finalComments.map((row) => (
                  <FinalCommentCard key={row.enrolmentId} row={row} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
