import { notFound } from "next/navigation";
import { getCourseAccess } from "@/lib/courseAccess";
import { createClient } from "@/lib/supabase/server";
import {
  countLearners,
  parseLearnerFilters,
  rosterFilterOptions,
  scopeRoster,
  toRosterRow,
} from "@/lib/learners/roster";
import { LocalTimeZone } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import { LearnerCard } from "./LearnerCard";
import { LearnerFilters } from "./LearnerFilters";

// /studio/learners — the roster (AUTH-011, docs/decisions/0109 Decision 8,
// 0116). Who may see which learner is decided in SQL: learner_roster()
// (063) returns only courses the caller edits (can_edit_course).
// getCourseAccess() here is the page gate (the Studio layout's too), not
// the data boundary.
//
// The page reads the roster unfiltered and narrows it with lib/learners,
// the review queue's pattern (0114 Decision 4): the filter menus need the
// unfiltered rows.

export const metadata = { title: "Learners" };

export default async function LearnersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { isAdmin, editableCourseIds } = await getCourseAccess();
  if (!isAdmin && editableCourseIds.length === 0) notFound();

  const filters = parseLearnerFilters(await searchParams);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("learner_roster");
  if (error) throw new Error(error.message);

  const allRows = ((data ?? []) as Record<string, unknown>[]).map(toRosterRow);
  const options = rosterFilterOptions(allRows, filters.course);
  const rows = scopeRoster(allRows, filters);
  const people = countLearners(rows);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Learners</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Signed-in learners of the courses you edit: where they came from and what they have done.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Visitors who never sign in aren&apos;t listed: their progress stays on their device. Times are in your
            timezone (<LocalTimeZone />).
          </p>
        </div>
        {allRows.length > 0 && <LearnerFilters filters={filters} options={options} />}
      </div>

      {allRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4">
          No learners yet. A learner appears here once they open a lesson while signed in, or join a run.
        </div>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            {people === 1 ? "1 learner" : `${people} learners`}
          </h2>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4">
              Nobody matches these filters.
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <LearnerCard key={`${row.courseId}:${row.userId}:${row.enrolmentId ?? "none"}`} row={row} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
