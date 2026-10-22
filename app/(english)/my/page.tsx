import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight, Check, ClipboardList, ExternalLink, MessageSquare, Sparkles, Video } from "lucide-react";
import { parseSurfaceLang, SURFACE_LANG_COOKIE, type SurfaceLang } from "@/lib/alliengll/surfaceLang";
import { feedbackKey, type FeedbackItem } from "@/lib/learnerHome";
import { getLearnerHome, type HomeCourseCard, type LearnerHome } from "@/lib/learnerHomeData";
import { getSignedInAccount } from "@/lib/signedInAccount";
import type { MyTeacher } from "@/lib/teacherLinks";
import { getMyTeachers } from "@/lib/teacherLinksServer";
import { dueState, formatDueDate, homeworkHref, type MyHomework } from "@/lib/homework/homework";
import { getMyHomework } from "@/lib/homework/homeworkServer";
import { getCalendarFeedStatus, getCalendarPageData, type CalendarFeedStatus, type CalendarPageData } from "@/lib/calendar/calendarServer";
import { unreadTotal, type Thread } from "@/lib/messages/messages";
import { getThreads } from "@/lib/messages/messagesServer";
// Direct paths, not the lesson-player barrel (docs/decisions/0059).
import { LESSON_HEADER_COLUMN_CLASS } from "@/app/components/lesson-player/columnLayout";
import { FeedbackContentView } from "@/app/components/lesson-player/blocks/FeedbackContentView";
import { CalendarView } from "@/app/components/calendar/CalendarView";
import { CalendarFeedPanel } from "@/app/components/calendar/CalendarFeedPanel";
import { TimeZoneSync } from "@/app/components/calendar/TimeZoneSync";
import { TelegramRemindersPanel } from "@/app/components/telegram/TelegramRemindersPanel";
import { telegramPanelCopy } from "@/app/components/telegram/telegramCopy";
import { getMyTelegramLinked } from "@/lib/telegram/status";
import { learnerAnalysisHref, type LearnerAnalysisRow } from "@/lib/voice/analysis/learnerList";
import { getLearnerAnalyses } from "@/lib/voice/analysis/learnerRead";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AccountMenu } from "../AccountMenu";
import { BandTopBar } from "../BandTopBar";
import { LocalDateTime } from "../LocalDateTime";
import { SectionHeading } from "../SectionHeading";
import { HERO_ENTER_CLASS, PAPER_CARD_CLASS, PAPER_PANEL_CLASS, PAPER_PILL_HIGHLIGHT_CLASS } from "../surfaceClasses";
import { myCopy } from "./myCopy";

export async function generateMetadata(): Promise<Metadata> {
  const lang = parseSurfaceLang((await cookies()).get(SURFACE_LANG_COOKIE)?.value);
  return { title: myCopy[lang].metaTitle, robots: { index: false } };
}

// CohortInfo's call row and Join button, so a call reads the same here as on
// the course page.
const LINK_BUTTON_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand-subtle px-4 py-2.5 text-sm font-medium text-brand-text outline-none transition-colors hover:bg-brand-subtle-hover focus-visible:ring-2 focus-visible:ring-brand";
// SHELL-028's frame and numeral tile (docs/decisions/0166), on the grid paper since PROG-007.
const ROW_CARD_CLASS = `${PAPER_PANEL_CLASS} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5`;
const ICON_TILE_CLASS =
  "flex size-10 flex-none items-center justify-center rounded-xl border-2 border-ink bg-highlight text-highlight-foreground";
const EMPTY_BOX_CLASS = "rounded-2xl border-2 border-dashed border-ink/40 p-6 text-center";
const SMALL_PILL_CLASS = "inline-flex w-fit items-center rounded-full bg-brand-subtle px-2 py-0.5 text-xs font-medium text-brand-text";
const MUTED_PILL_CLASS = "inline-flex w-fit items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground";

/**
 * PROG-002 (docs/decisions/0120) — the learner home. A signed-in learner's
 * courses (attempted, enrolled through a run, or granted), each with the two
 * progress numbers, never blended (docs/handoff.md, "Scoring and
 * progress"); the next call for an extended enrolee; and the feedback they
 * have received. Every row comes from lib/learnerHomeData.ts's reads under
 * the learner's own session; this page decides no access.
 *
 * Signed out: proxy.ts sends `/my` to /login?next=/my (its own guard, the
 * /studio precedent; 0049's revisit clause). The redirect below is the same
 * rule for a session that lapses between the proxy and the page.
 *
 * The chrome follows the saved EN/RU choice with no toggle of its own
 * (owner, 2026-10-11). A Server Component; its only client JS is
 * LocalDateTime, already shipped by the cohort course page.
 */
export default async function MyPage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const { month: rawMonth } = await searchParams;
  const [home, teachers, threads, homework, calendar, feed, telegramLinked, analyses] = await Promise.all([
    getLearnerHome(new Date()),
    getMyTeachers(),
    getStudentThreads(),
    getStudentHomework(),
    getStudentCalendar(typeof rawMonth === "string" ? rawMonth : undefined),
    getStudentFeedStatus(),
    getMyTelegramLinked(),
    getStudentAnalyses(),
  ]);
  if (!home) redirect(`/login?${new URLSearchParams({ next: "/my" }).toString()}`);

  const lang = parseSurfaceLang((await cookies()).get(SURFACE_LANG_COOKIE)?.value);
  const m = myCopy[lang];
  const signedIn = await getSignedInAccount();
  const hasEnrolment = home.courses.some((c) => c.enrolments.length > 0);

  return (
    // The Alina Cher grid paper (PROG-007, docs/decisions/0191), as the course
    // page and the lesson page have had since SHELL-028 (0166).
    <main className="grid-paper">
      <section>
        <div className={`${LESSON_HEADER_COLUMN_CLASS} relative flex flex-col gap-8 pb-8 pt-5 sm:pb-10 lg:pt-6`}>
          <BandTopBar
            tone="paper"
            back={{ href: "/#catalogue", label: m.backToCatalogue }}
            // Sign-out from here returns to `/`: `/my` itself would only
            // bounce a signed-out visitor to the sign-in page.
            account={signedIn && <AccountMenu email={signedIn.email} username={signedIn.username} studio={signedIn.isEditor} unread={signedIn.unreadMessages} lang={lang} next="/" tone="paper" />}
          />
          <div className={`${HERO_ENTER_CLASS} flex flex-col items-start gap-3`}>
            <span className={PAPER_PILL_HIGHLIGHT_CLASS}>{m.eyebrow}</span>
            <h1 className="text-balance font-display text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">{m.title}</h1>
            <p className="max-w-xl text-base text-muted-foreground sm:text-lg">{m.lead}</p>
          </div>
        </div>
      </section>

      <div className={`${LESSON_HEADER_COLUMN_CLASS} flex w-full flex-col gap-12 pb-12 pt-4 sm:gap-16 sm:pb-16`}>
        {home.nextCall && <NextCall lang={lang} call={home.nextCall} />}

        <section className="flex flex-col gap-6" data-my="courses">
          <SectionHeading display title={m.coursesTitle} />
          {home.courses.length === 0 ? (
            <div className={`${EMPTY_BOX_CLASS} flex flex-col items-center gap-4`}>
              <p className="text-sm text-muted-foreground">{m.coursesEmpty}</p>
              <Link href="/#catalogue" className={LINK_BUTTON_CLASS}>
                {m.browseCourses}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {home.courses.map((card) => (
                <li key={card.course.id}>
                  <CourseRow lang={lang} card={card} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {homework.length > 0 && (
          <section className="flex flex-col gap-6" data-my="homework">
            <SectionHeading display title={m.homeworkTitle} />
            <p className="-mt-3 text-sm text-muted-foreground">{m.homeworkLead}</p>
            <ul className="flex flex-col gap-3">
              {homework.map((h) => (
                <li key={h.id}>
                  <HomeworkRow lang={lang} homework={h} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {calendar && calendar.items.length > 0 && (
          <section id="calendar" className="flex scroll-mt-6 flex-col gap-6" data-my="calendar">
            <TimeZoneSync />
            <SectionHeading display title={m.calendarTitle} />
            <p className="-mt-3 text-sm text-muted-foreground">{m.calendarLead}</p>
            <CalendarView {...calendar} lang={lang} basePath="/my" paper />
            {feed && (
              <CalendarFeedPanel
                hasToken={feed.hasToken}
                createdLabel={feed.createdAt ? formatFeedDate(feed.createdAt, lang) : null}
                lang={lang}
                paper
              />
            )}
          </section>
        )}

        {threads.length > 0 && (
          <section className="flex flex-col gap-6" data-my="messages">
            <SectionHeading display title={m.messagesTitle} />
            <Link href="/my/messages" className={`${PAPER_CARD_CLASS} flex items-center gap-3 p-4 sm:p-5`}>
              <span className={ICON_TILE_CLASS}>
                <MessageSquare className="size-4" aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                <p className="min-w-0 flex-1 text-sm font-semibold text-foreground sm:text-base">{m.messagesOpen}</p>
                {unreadTotal(threads) > 0 ? (
                  <span className="inline-flex w-fit items-center rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-white">
                    {m.messagesNew(unreadTotal(threads))}
                  </span>
                ) : (
                  <span className={MUTED_PILL_CLASS}>{m.messagesNone}</span>
                )}
              </div>
              <ArrowRight className="size-3.5 flex-none text-brand-text" aria-hidden="true" />
            </Link>
          </section>
        )}

        {teachers.length > 0 && (
          <section className="flex flex-col gap-6" data-my="teachers">
            <SectionHeading display title={m.teachersTitle} />
            <p className="-mt-3 text-sm text-muted-foreground">{m.teachersLead}</p>
            <ul className="flex flex-col gap-3">
              {teachers.map((teacher) => (
                <li key={teacher.linkId}>
                  <TeacherRow lang={lang} teacher={teacher} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* COH-010: reminders are for an enrolee; a failed read leaves the panel out. */}
        {hasEnrolment && telegramLinked !== null && (
          <section data-my="reminders">
            <TelegramRemindersPanel linked={telegramLinked} lang={lang} copy={telegramPanelCopy[lang]} paper />
          </section>
        )}

        {/* PROG-007: the learner's own finished AI feedback, a doorway to each lesson. Left
            out while the mode is `off` (no read is made) and when there is none. */}
        {analyses.length > 0 && (
          <section className="flex flex-col gap-6" data-my="ai-feedback">
            <SectionHeading display title={m.aiTitle} />
            <p className="-mt-3 text-sm text-muted-foreground">{m.aiLead}</p>
            <ul className="flex flex-col gap-3">
              {analyses.map((row) => (
                <li key={row.submissionId}>
                  <AnalysisRow lang={lang} row={row} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {(hasEnrolment || home.feedback.length > 0) && (
          <section className="flex flex-col gap-6" data-my="feedback">
            <SectionHeading display title={m.feedbackTitle} />
            {home.feedback.length === 0 ? (
              <p className={`${EMPTY_BOX_CLASS} text-sm text-muted-foreground`}>
                {m.feedbackEmpty}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {home.feedback.map((item) => (
                  <li key={feedbackKey(item)}>
                    <FeedbackCard lang={lang} item={item} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

// The calendar is a courtesy on the learner home, like Messages: if its read
// fails (085 not yet applied, a transient error) the section is left out and
// the rest of /my renders. /studio/calendar reads strictly.
async function getStudentCalendar(rawMonth: string | undefined): Promise<CalendarPageData | null> {
  try {
    return await getCalendarPageData("learner", rawMonth);
  } catch (e) {
    console.error("/my: my_calendar failed", e);
    return null;
  }
}

// The feed panel is a courtesy too (086): without the migration the status read
// fails and the panel is left out; the calendar above it does not depend on it.
async function getStudentFeedStatus(): Promise<CalendarFeedStatus | null> {
  try {
    return await getCalendarFeedStatus();
  } catch (e) {
    console.error("/my: calendar_feed_status failed", e);
    return null;
  }
}

function formatFeedDate(iso: string, lang: SurfaceLang): string {
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

// The Messages row is a courtesy on the learner home: if the read fails (079
// not yet applied, a transient error) the row is left out and the page, which
// does not depend on it, still renders. /my/messages itself reads strictly.
async function getStudentThreads(): Promise<Thread[]> {
  try {
    return await getThreads("student");
  } catch (e) {
    console.error("/my: message_threads failed", e);
    return [];
  }
}

// Like the Messages row, the Homework section is a courtesy: if the read fails
// (080 not yet applied, a transient error) the section is left out and the page
// still renders.
async function getStudentHomework(): Promise<MyHomework[]> {
  try {
    return await getMyHomework();
  } catch (e) {
    console.error("/my: my_homework failed", e);
    return [];
  }
}

// Like the Messages row, the AI feedback list is a courtesy: if its read fails
// the section is left out and the page still renders. The list reads under the
// learner's own session and returns nothing while the mode is `off`.
async function getStudentAnalyses(): Promise<LearnerAnalysisRow[]> {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    return user ? await getLearnerAnalyses(supabase, user.id) : [];
  } catch (e) {
    console.error("/my: voice analyses failed", e);
    return [];
  }
}

function localeFor(lang: SurfaceLang): "ru-RU" | "en-GB" {
  return lang === "ru" ? "ru-RU" : "en-GB";
}

// Leave is a native <details> with a confirm button inside, so the step is
// confirmed with no client JS (the AccountMenu <details> precedent,
// docs/decisions/0086). The button posts a plain form to
// /api/teacher-links/leave.
function TeacherRow({ lang, teacher }: { lang: SurfaceLang; teacher: MyTeacher }) {
  const m = myCopy[lang];
  return (
    <div className={`${PAPER_PANEL_CLASS} flex flex-col gap-3 p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="break-words text-sm font-semibold text-foreground sm:text-base">{teacher.teacherName}</p>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {m.linkedSince} <time dateTime={teacher.linkedAt}>
              {new Date(teacher.linkedAt).toLocaleDateString(localeFor(lang), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
            </time>
          </p>
        </div>
        <details className="group">
          <summary
            className={`${LINK_BUTTON_CLASS} cursor-pointer list-none group-open:hidden [&::-webkit-details-marker]:hidden`}
          >
            {m.leave}
          </summary>
          <form action="/api/teacher-links/leave" method="post" className="flex flex-col gap-3">
            <input type="hidden" name="linkId" value={teacher.linkId} />
            <p className="max-w-sm text-sm text-muted-foreground">{m.leaveConfirm(teacher.teacherName)}</p>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={LINK_BUTTON_CLASS}>
                {m.leaveConfirmYes}
              </button>
            </div>
          </form>
        </details>
      </div>
    </div>
  );
}

// One assignment (TCH-005, docs/decisions/0152). The whole row is a link to the
// lesson or course; the access state of a lesson the learner cannot open yet is
// _lesson_access_at's, read in SQL, shown as a muted pill. The due date reads
// "Due 20 Oct", and once past "Was due 20 Oct" in the same muted tokens: never
// a destructive colour, and nothing locks (docs/handoff.md, "Scoring and
// progress").
function HomeworkRow({ lang, homework: h }: { lang: SurfaceLang; homework: MyHomework }) {
  const m = myCopy[lang];
  const today = new Date();
  const locale = localeFor(lang);
  const past = dueState(h.dueOn, today) === "past";
  const access =
    h.access === "needs_sign_in"
      ? m.homeworkNeedsSignIn
      : h.access === "needs_entitlement"
        ? m.homeworkNeedsEntitlement
        : h.access === "scheduled" && h.opensAt
          ? m.homeworkOpensOn(new Date(h.opensAt).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" }))
          : null;
  return (
    <Link href={homeworkHref(h)} className={`${PAPER_CARD_CLASS} flex gap-3 p-4 sm:p-5`} data-homework-done={h.done}>
      <span className={ICON_TILE_CLASS}>
        {h.done ? <Check className="size-4" aria-hidden="true" /> : <ClipboardList className="size-4" aria-hidden="true" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="break-words text-sm font-semibold text-foreground sm:text-base">
          {h.lessonTitle ?? h.courseTitle}
          {!h.lessonTitle && <span className="font-normal text-muted-foreground"> · {m.homeworkWholeCourse}</span>}
        </p>
        <p className="break-words text-xs text-muted-foreground sm:text-sm">
          {h.lessonTitle && <>{h.courseTitle} · </>}
          {m.homeworkFrom(h.teacherName)}
        </p>
        {h.note && <p className="whitespace-pre-line break-words text-sm text-foreground">{h.note}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          {h.done && <span className={SMALL_PILL_CLASS}>{m.homeworkDone}</span>}
          {!h.done && !h.lessonId && h.totalLessons > 1 && (
            <span className={MUTED_PILL_CLASS}>{m.homeworkProgress(h.doneLessons, h.totalLessons)}</span>
          )}
          {h.dueOn && (
            <span className={MUTED_PILL_CLASS}>
              {(past ? m.homeworkWasDue : m.homeworkDue)(formatDueDate(h.dueOn, locale, today))}
            </span>
          )}
          {access && !h.done && <span className={MUTED_PILL_CLASS}>{access}</span>}
        </div>
      </div>
      <ArrowRight className="size-3.5 flex-none self-center text-brand-text" aria-hidden="true" />
    </Link>
  );
}

// One analysed take (PROG-007, docs/decisions/0191): where it was recorded, when, and a link to
// that lesson, where the feedback itself is drawn. The whole row is the link when the lesson is
// still readable; otherwise it is the same row with no link and no arrow.
function AnalysisRow({ lang, row }: { lang: SurfaceLang; row: LearnerAnalysisRow }) {
  const m = myCopy[lang];
  const href = learnerAnalysisHref(row);
  const where = [row.courseTitle, row.lessonTitle].filter(Boolean).join(" · ");
  const body = (
    <>
      <span className={ICON_TILE_CLASS}>
        <Sparkles className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="break-words text-sm font-semibold text-foreground sm:text-base">{where || m.aiFirst}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={SMALL_PILL_CLASS}>{row.kind === "final" ? m.aiFinal : m.aiFirst}</span>
          <span className="text-xs text-muted-foreground sm:text-sm">
            <LocalDateTime iso={row.sentAt} locale={localeFor(lang)} />
          </span>
        </div>
      </div>
      {href && <ArrowRight className="size-3.5 flex-none self-center text-brand-text" aria-hidden="true" />}
    </>
  );
  return href ? (
    <Link href={href} className={`${PAPER_CARD_CLASS} flex gap-3 p-4 sm:p-5`} data-analysis-kind={row.kind}>
      {body}
      <span className="sr-only">{m.openLesson}</span>
    </Link>
  ) : (
    <div className={`${PAPER_PANEL_CLASS} flex gap-3 p-4 sm:p-5`} data-analysis-kind={row.kind}>
      {body}
    </div>
  );
}

function NextCall({ lang, call }: { lang: SurfaceLang; call: NonNullable<LearnerHome["nextCall"]> }) {
  const m = myCopy[lang];
  return (
    <section className="flex flex-col gap-6" data-my="next-call">
      <SectionHeading display title={m.nextCallTitle} />
      <div className={ROW_CARD_CLASS}>
        <div className="flex min-w-0 items-start gap-3">
          <span className={ICON_TILE_CLASS}>
            <Video className="size-4" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm font-semibold text-foreground sm:text-base">
              <LocalDateTime iso={call.startsAt} locale={localeFor(lang)} />
            </p>
            <p className="text-xs text-muted-foreground sm:text-sm">
              <Link href={`/courses/${call.courseSlug}`} className="underline-offset-4 hover:underline">
                {call.courseTitle}
              </Link>
              {call.title && <> · {call.title}</>}
            </p>
          </div>
        </div>
        <a href={call.meetUrl} target="_blank" rel="noopener noreferrer" className={`${LINK_BUTTON_CLASS} self-start sm:self-auto`}>
          {m.join}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

function CourseRow({ lang, card }: { lang: SurfaceLang; card: HomeCourseCard }) {
  const m = myCopy[lang];
  const { course, progress } = card;
  const latest = card.enrolments[0];
  // PROG-003 (docs/decisions/0179): the card is a stretched link (the title's
  // ::after covers it) so the Continue action can be a second, real link above
  // it; two <a> cannot nest.
  return (
    <div
      className={`${PAPER_CARD_CLASS} relative flex h-full flex-col gap-3 p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand sm:p-5`}
    >
      <div className="flex gap-3">
        <div className="relative size-16 flex-none overflow-hidden rounded-xl border-2 border-ink bg-muted">
          {course.coverImageUrl ? (
            <Image src={course.coverImageUrl} alt="" fill className="object-cover" sizes="64px" />
          ) : (
            // CourseCard's grid-paper level tile (0165), not a gradient.
            <div className="grid-paper relative flex h-full items-center justify-center overflow-hidden bg-brand-subtle">
              <span className="relative font-display text-base font-extrabold tracking-tight text-brand-text">{course.level}</span>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={PAPER_PILL_HIGHLIGHT_CLASS}>{course.level}</span>
            {latest && (
              <span className={MUTED_PILL_CLASS}>
                {latest.tier === "extended" ? m.tierExtended : m.tierBasic}
                {latest.runTitle && <> · {latest.runTitle}</>}
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-foreground sm:text-base">
            <Link href={`/courses/${course.slug}`} className="outline-none after:absolute after:inset-0 after:content-['']">
              {course.title}
            </Link>
          </h3>
          {/* Two numbers, never blended (docs/handoff.md). The average is over
              attempted lessons only, so it is absent until one is attempted. */}
          <dl className="mt-auto flex flex-wrap gap-x-5 gap-y-1 pt-1">
            <div className="flex flex-col-reverse">
              <dt className="text-xs text-muted-foreground">{m.attempted}</dt>
              <dd className="font-display text-base font-extrabold text-foreground">
                {progress.attempted} {m.of} {progress.total}
              </dd>
            </div>
            {progress.averagePercent !== null && (
              <div className="flex flex-col-reverse">
                <dt className="text-xs text-muted-foreground">{m.average}</dt>
                <dd className="font-display text-base font-extrabold text-foreground">{progress.averagePercent}%</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
      {card.continueLesson && (
        <Link
          href={`/courses/${course.slug}/${card.continueLesson.slug}`}
          className={`${LINK_BUTTON_CLASS} relative z-10 max-w-full self-start`}
        >
          <span className="truncate">
            {m.continuePrefix}
            {card.continueLesson.title}
          </span>
          <ArrowRight className="size-3.5 flex-none" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

function FeedbackCard({ lang, item }: { lang: SurfaceLang; item: FeedbackItem }) {
  const m = myCopy[lang];
  const link =
    item.kind === "voice"
      ? item.courseSlug && item.lessonSlug
        ? { href: `/courses/${item.courseSlug}/${item.lessonSlug}`, label: m.openLesson }
        : null
      : { href: `/runs/${item.runId}`, label: m.openBeforeAfter };
  const where = [item.courseTitle, item.kind === "voice" ? item.lessonTitle : null].filter(Boolean).join(" · ");

  return (
    <article
      className={`${PAPER_PANEL_CLASS} flex flex-col gap-3 p-4 sm:p-5`}
      data-feedback-kind={item.kind}
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold text-foreground sm:text-base">
          {item.kind === "voice" ? m.voiceFeedback : m.finalComment}
        </p>
        <p className="text-xs text-muted-foreground sm:text-sm">
          {where && <>{where} · </>}
          <LocalDateTime iso={item.publishedAt} locale={localeFor(lang)} />
        </p>
      </div>
      <div className="rounded-xl bg-brand-subtle px-4 py-3 text-sm text-foreground">
        <FeedbackContentView content={item.body} />
      </div>
      {link && (
        <Link href={link.href} className={`${LINK_BUTTON_CLASS} self-start`}>
          {link.label}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      )}
    </article>
  );
}
