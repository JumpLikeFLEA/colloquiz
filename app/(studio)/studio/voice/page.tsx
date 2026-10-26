import Link from "next/link";
import { notFound } from "next/navigation";
import { canEnterStudio, getCourseAccess } from "@/lib/courseAccess";
import { listAuthoredCourses } from "@/lib/courseAuthoring";
import { createClient } from "@/lib/supabase/server";
import {
  STATE_LABEL,
  STATE_PILL,
  pageCount,
  parseVoiceListFilters,
  studioAnalysisState,
  voiceListQuery,
} from "@/lib/voice/analysis/studioList";
import { listAnalysedTakes } from "@/lib/voice/analysis/studioRead";
import { LocalTime, LocalTimeZone } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import { VoiceFilters } from "./VoiceFilters";
import { RecordingsTabs } from "../RecordingsTabs";

// /studio/voice — every analysed take on the courses the caller edits, self-paced ones included
// (VOICE-015, docs/decisions/0156 Decision 9, 0190). Rows come from voice_analyses under the
// caller's own session (096's editor policy); the course scope is applied explicitly as well,
// because the same table lets a caller read their OWN takes on courses they do not edit.
// getCourseAccess() is the page gate (the Studio layout's too), not the data boundary.

export const metadata = { title: "AI feedback" };

const ROW_LINK = "block rounded-2xl border border-border bg-card px-4 py-3 space-y-1 hover:bg-accent transition-colors";
const PAGE_LINK = "inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-medium hover:bg-accent";

export default async function VoiceListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await getCourseAccess();
  if (!canEnterStudio(access)) notFound();

  const filters = parseVoiceListFilters(await searchParams);
  const supabase = await createClient();
  const courseIds = access.isAdmin ? null : access.editableCourseIds;
  const [{ items, total }, courses] = await Promise.all([
    listAnalysedTakes(supabase, courseIds, filters),
    listAuthoredCourses(courseIds ?? undefined),
  ]);
  const pages = pageCount(total);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="space-y-3">
        <RecordingsTabs tab="voice" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI feedback</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every voice take the AI has analysed on your courses, free ones too, with the recording. Open one to
            hear it and, if the analysis is wrong, hide it.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Times are in your timezone (<LocalTimeZone />).
          </p>
        </div>
        {courses.length > 0 && (
          <VoiceFilters course={filters.course} courses={courses.map((c) => ({ id: c.id, title: c.title }))} />
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          Analysed takes <span className="text-muted-foreground font-normal">({total})</span>
        </h2>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4">
            {filters.course || filters.page > 1
              ? "Nothing matches these filters."
              : "No analysed takes yet. They appear here as soon as a learner sends a recording."}
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((r) => {
              const state = studioAnalysisState(r);
              return (
                <li key={r.submissionId}>
                  <Link href={`/studio/voice/${r.submissionId}`} prefetch={false} className={ROW_LINK}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground break-all min-w-0">{r.learner}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATE_PILL[state]}`}>
                        {STATE_LABEL[state]}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-muted text-muted-foreground">
                        {r.cohort ? "Cohort" : "Self-paced"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground break-words">
                      {r.courseTitle} · {r.lessonTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sent <LocalTime iso={r.sentAt} />
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {pages > 1 && (
          <nav className="flex items-center justify-between gap-2 pt-1" aria-label="Pages">
            {filters.page > 1 ? (
              <Link href={`/studio/voice${voiceListQuery({ ...filters, page: filters.page - 1 })}`} className={PAGE_LINK}>
                Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="text-xs text-muted-foreground">
              Page {filters.page} of {pages}
            </span>
            {filters.page < pages ? (
              <Link href={`/studio/voice${voiceListQuery({ ...filters, page: filters.page + 1 })}`} className={PAGE_LINK}>
                Older
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
