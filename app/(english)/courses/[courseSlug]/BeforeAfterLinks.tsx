import Link from "next/link";
import { Mic } from "lucide-react";
import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import type { ActiveEnrolment, PublicRun } from "@/lib/cohortCoursePage";
import { courseCopy } from "./courseCopy";

// CohortInfo's call row and Join button, so the two read as one block.
const LINK_BUTTON_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand-subtle px-4 py-2.5 text-sm font-medium text-brand-text outline-none transition-colors hover:bg-brand-subtle-hover focus-visible:ring-2 focus-visible:ring-brand";

/**
 * COH-005 (docs/decisions/0115) — an enrolled learner's way to the
 * before/after screen, one row per run they are enrolled in (a repeat run
 * is its own enrolment, 0112 Decision 1). Shown from enrolment, whatever
 * has been recorded yet: the screen itself says what is missing. The run
 * title is shown only when there is more than one row to tell apart.
 * A Server Component; `enrolments` are the caller's own non-revoked rows.
 */
export function BeforeAfterLinks({
  lang,
  enrolments,
  runs,
}: {
  lang: SurfaceLang;
  enrolments: readonly ActiveEnrolment[];
  runs: readonly PublicRun[];
}) {
  if (enrolments.length === 0) return null;
  const c = courseCopy[lang];
  const runTitle = new Map(runs.map((r) => [r.id, r.title]));
  return (
    <ul className="flex flex-col gap-3" data-cohort="before-after">
      {enrolments.map((e) => (
        <li
          key={e.runId}
          className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-accent text-white shadow-md shadow-brand/30">
              <Mic className="size-4" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm font-semibold text-foreground sm:text-base">
                {c.beforeAfterTitle}
                {enrolments.length > 1 && runTitle.get(e.runId) && (
                  <span className="font-normal text-muted-foreground"> · {runTitle.get(e.runId)}</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground sm:text-sm">{c.beforeAfterDesc}</p>
            </div>
          </div>
          <Link href={`/runs/${e.runId}`} className={`${LINK_BUTTON_CLASS} self-start sm:self-auto`}>
            {c.beforeAfterOpen}
          </Link>
        </li>
      ))}
    </ul>
  );
}
