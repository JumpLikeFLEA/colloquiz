import { ExternalLink, Video } from "lucide-react";
import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import { callsForAudience, nextUpcomingRun, splitCalls, type CohortAudience, type PublicRun, type RunCall } from "@/lib/cohortCoursePage";
import { LocalDateTime } from "../../LocalDateTime";
import { SectionHeading } from "../../SectionHeading";
import { courseCopy } from "./courseCopy";

// The paid-lesson card's "Back to course" button (LessonUnavailable.tsx),
// reused for Join and "How to join".
const LINK_BUTTON_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand-subtle px-4 py-2.5 text-sm font-medium text-brand-text outline-none transition-colors hover:bg-brand-subtle-hover focus-visible:ring-2 focus-visible:ring-brand";

/**
 * COH-004 (docs/decisions/0108) — the cohort block under a cohort course's
 * lesson list, by audience (`cohortAudience`, lib/cohortCoursePage.ts):
 *
 * - `extended`: the run's calls, next one first, each with a Join link
 *   (a plain link to the Meet URL, no provider JS); past calls follow,
 *   muted and without a link (0093 "Run lifecycle").
 * - `basic`: nothing. Not an empty section: nothing about calls at all.
 * - `visitor`: what 0093 "Non-enrolled visitor" lists beyond the lesson
 *   list — the next run's start, the tiers, and `how_to_join_url` as a
 *   plain link. No calls, no Meet URL.
 * - `none` (an editor, a comp grant): nothing.
 *
 * A Server Component. The calls come from `course_calls` (058), which
 * returns no rows to a basic learner or a visitor in the first place.
 */
export function CohortInfo({
  lang,
  audience,
  calls,
  runs,
  howToJoinUrl,
  now,
}: {
  lang: SurfaceLang;
  audience: CohortAudience;
  calls: readonly RunCall[];
  runs: readonly PublicRun[];
  howToJoinUrl: string | null;
  now: Date;
}) {
  const c = courseCopy[lang];
  const locale = lang === "ru" ? "ru-RU" : "en-GB";

  if (audience.kind === "extended") {
    const { upcoming, past } = splitCalls(callsForAudience(calls, audience), now);
    return (
      <section className="flex flex-col gap-6" data-cohort="calls">
        <SectionHeading eyebrow={c.callsEyebrow} title={c.callsTitle} />
        {upcoming.length === 0 && past.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {c.callsEmpty}
          </p>
        ) : (
          <>
            {upcoming.length > 0 && (
              <ol className="flex flex-col gap-3">
                {upcoming.map((call) => (
                  <li
                    key={call.id}
                    className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-accent text-white shadow-md shadow-brand/30">
                        <Video className="size-4" aria-hidden="true" />
                      </span>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="text-sm font-semibold text-foreground sm:text-base">
                          <LocalDateTime iso={call.startsAt} locale={locale} />
                        </p>
                        {call.title && <p className="text-xs text-muted-foreground sm:text-sm">{call.title}</p>}
                      </div>
                    </div>
                    <a href={call.meetUrl} target="_blank" rel="noopener noreferrer" className={`${LINK_BUTTON_CLASS} self-start sm:self-auto`}>
                      {c.callsJoin}
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ol>
            )}
            {past.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-muted-foreground">{c.callsPast}</h3>
                <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {past.map((call) => (
                    <li key={call.id}>
                      <LocalDateTime iso={call.startsAt} locale={locale} />
                      {call.title && <> · {call.title}</>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
    );
  }

  if (audience.kind === "visitor") {
    const next = nextUpcomingRun(runs, now);
    return (
      <section className="flex flex-col gap-6" data-cohort="visitor">
        <SectionHeading eyebrow={c.cohortEyebrow} title={c.cohortTitle} subtitle={c.cohortIntro} />
        <p className="text-sm text-foreground sm:text-base">
          {next ? (
            <>
              {c.nextRun} <span className="font-semibold"><LocalDateTime iso={next.startsAt} locale={locale} /></span>
              {next.title && <span className="text-muted-foreground"> · {next.title}</span>}
            </>
          ) : (
            <span className="text-muted-foreground">{c.noUpcomingRun}</span>
          )}
        </p>
        <div className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold text-foreground">{c.tiersTitle}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              [c.tierBasic, c.tierBasicDesc],
              [c.tierExtended, c.tierExtendedDesc],
            ].map(([name, desc]) => (
              <div key={name} className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
                <p className="text-sm font-semibold text-foreground sm:text-base">{name}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">{desc}</p>
              </div>
            ))}
          </div>
        </div>
        {howToJoinUrl && (
          <a href={howToJoinUrl} target="_blank" rel="noopener noreferrer" className={`${LINK_BUTTON_CLASS} self-start`}>
            {c.howToJoin}
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        )}
      </section>
    );
  }

  return null;
}
