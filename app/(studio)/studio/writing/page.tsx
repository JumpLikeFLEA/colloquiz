import { notFound } from "next/navigation";
import { canEnterStudio, getCourseAccess } from "@/lib/courseAccess";
import { createClient } from "@/lib/supabase/server";
import { MultilineInlineContentSchema } from "@/lib/lessons/inline";
import { inlinePlainText } from "@/lib/lessons/plainText";
import {
  matchesWritingStatus,
  parseWritingFilters,
  toWritingReviewRow,
  writingCourseOptions,
} from "@/lib/writing/review";
import { LocalTimeZone } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import { ReviewsTabs } from "../ReviewsTabs";
import { WritingCard, type WritingCardRow } from "./WritingCard";
import { WritingFilters } from "./WritingFilters";
import { WRITING_STATUS_FILTER_LABEL } from "./labels";

// /studio/writing — written answers sent to the caller (WRITE-003, docs/decisions/0225
// Decision 4). Who may see which answer is decided in SQL: writing_review_queue() (migration
// 109) returns only answers _writing_can_review allows, and save_writing_feedback checks it
// again. getCourseAccess() is the page gate (the layout's too), not the data boundary.
//
// Read unfiltered and narrowed here, like the recordings queue: the course menu needs every
// course that has an answer, and the queue is a teacher's worth of rows, not a feed. A failed
// read shows a message, not an error page (109 may not be applied yet).

export const metadata = { title: "Written answers" };

const EMPTY_BOX =
  "flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4";

export default async function WritingReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await getCourseAccess();
  if (!canEnterStudio(access)) notFound();

  const filters = parseWritingFilters(await searchParams);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("writing_review_queue");
  if (error) console.error("Studio: writing_review_queue failed", error.message);
  const all = error ? null : ((data ?? []) as Record<string, unknown>[]).map(toWritingReviewRow);

  const cards: WritingCardRow[] = (all ?? [])
    .filter((r) => !filters.course || r.courseId === filters.course)
    .filter((r) => matchesWritingStatus(r.status, filters.status))
    .map((r) => {
      const prompt = MultilineInlineContentSchema.safeParse(r.blockPrompt);
      return { ...r, promptText: prompt.success ? inlinePlainText(prompt.data) : "" };
    });

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="space-y-3">
        <ReviewsTabs tab="writing" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Written answers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Answers to writing tasks that were sent to you. Write feedback; publishing it locks the learner&apos;s
            answer.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Times are in your timezone (<LocalTimeZone />).
          </p>
        </div>
        {all && all.length > 0 && <WritingFilters filters={filters} courses={writingCourseOptions(all)} />}
      </div>

      {all === null ? (
        <div className={EMPTY_BOX}>Couldn&apos;t load written answers. Try again in a moment.</div>
      ) : all.length === 0 ? (
        <div className={EMPTY_BOX}>
          No written answers yet. They appear here when a cohort learner, or a student linked to you, sends the
          answer to a writing task that has Send answers to the teacher switched on.
        </div>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            Written answers{" "}
            <span className="text-muted-foreground font-normal">
              ({WRITING_STATUS_FILTER_LABEL[filters.status]}: {cards.length})
            </span>
          </h2>
          {cards.length === 0 ? (
            <div className={EMPTY_BOX}>
              {filters.status === "to_review" ? "Nothing waiting for feedback." : "Nothing matches these filters."}
            </div>
          ) : (
            <div className="space-y-3">
              {cards.map((row) => (
                <WritingCard key={row.submissionId} row={row} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
