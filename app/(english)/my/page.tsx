import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight, Check, ClipboardList, ExternalLink, MessageSquare, Video } from "lucide-react";
import { parseSurfaceLang, SURFACE_LANG_COOKIE, type SurfaceLang } from "@/lib/alliengll/surfaceLang";
import { feedbackKey, type FeedbackItem } from "@/lib/learnerHome";
import { getLearnerHome, type HomeCourseCard, type LearnerHome } from "@/lib/learnerHomeData";
import { getSignedInAccount } from "@/lib/signedInAccount";
import type { MyTeacher } from "@/lib/teacherLinks";
import { getMyTeachers } from "@/lib/teacherLinksServer";
import { dueState, formatDueDate, homeworkHref, type MyHomework } from "@/lib/homework/homework";
import { getMyHomework } from "@/lib/homework/homeworkServer";
import { unreadTotal, type Thread } from "@/lib/messages/messages";
import { getThreads } from "@/lib/messages/messagesServer";
// Direct paths, not the lesson-player barrel (docs/decisions/0059).
import { LESSON_HEADER_COLUMN_CLASS } from "@/app/components/lesson-player/columnLayout";
import { FeedbackContentView } from "@/app/components/lesson-player/blocks/FeedbackContentView";
import { AccountMenu } from "../AccountMenu";
import { BandTopBar } from "../BandTopBar";
import { GradientBackdrop } from "../HeroDecor";
import { LocalDateTime } from "../LocalDateTime";
import { SectionHeading } from "../SectionHeading";
import { GLASS_PILL_CLASS, GRADIENT_BAND_CLASS, HERO_ENTER_CLASS, LIFT_CARD_CLASS } from "../surfaceClasses";
import { myCopy } from "./myCopy";

export async function generateMetadata(): Promise<Metadata> {
  const lang = parseSurfaceLang((await cookies()).get(SURFACE_LANG_COOKIE)?.value);
  return { title: myCopy[lang].metaTitle, robots: { index: false } };
}

// CohortInfo's call row and Join button, so a call reads the same here as on
// the course page.
const LINK_BUTTON_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand-subtle px-4 py-2.5 text-sm font-medium text-brand-text outline-none transition-colors hover:bg-brand-subtle-hover focus-visible:ring-2 focus-visible:ring-brand";
const ROW_CARD_CLASS =
  "flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5";
const ICON_TILE_CLASS =
  "flex size-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-accent text-white shadow-md shadow-brand/30";
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
export default async function MyPage() {
  const [home, teachers, threads, homework] = await Promise.all([
    getLearnerHome(new Date()),
    getMyTeachers(),
    getStudentThreads(),
    getStudentHomework(),
  ]);
  if (!home) redirect(`/login?${new URLSearchParams({ next: "/my" }).toString()}`);

  const lang = parseSurfaceLang((await cookies()).get(SURFACE_LANG_COOKIE)?.value);
  const m = myCopy[lang];
  const signedIn = await getSignedInAccount();
  const hasEnrolment = home.courses.some((c) => c.enrolments.length > 0);

  return (
    <main className="bg-background">
      <section className={GRADIENT_BAND_CLASS}>
        <GradientBackdrop />
        <div className={`${LESSON_HEADER_COLUMN_CLASS} relative flex flex-col gap-8 pb-10 pt-5 sm:pb-12 lg:pt-6`}>
          <BandTopBar
            back={{ href: "/#catalogue", label: m.backToCatalogue }}
            // Sign-out from here returns to `/`: `/my` itself would only
            // bounce a signed-out visitor to the sign-in page.
            account={signedIn && <AccountMenu email={signedIn.email} studio={signedIn.isEditor} unread={signedIn.unreadMessages} lang={lang} next="/" />}
          />
          <div className={`${HERO_ENTER_CLASS} flex flex-col items-start gap-3`}>
            <span className={GLASS_PILL_CLASS}>{m.eyebrow}</span>
            <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{m.title}</h1>
            <p className="max-w-xl text-base text-white/80 sm:text-lg">{m.lead}</p>
          </div>
        </div>
      </section>

      <div className={`${LESSON_HEADER_COLUMN_CLASS} flex w-full flex-col gap-12 py-12 sm:gap-16 sm:py-16`}>
        {home.nextCall && <NextCall lang={lang} call={home.nextCall} />}

        <section className="flex flex-col gap-6" data-my="courses">
          <SectionHeading title={m.coursesTitle} />
          {home.courses.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border p-6 text-center">
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
            <SectionHeading title={m.homeworkTitle} />
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

        {threads.length > 0 && (
          <section className="flex flex-col gap-6" data-my="messages">
            <SectionHeading title={m.messagesTitle} />
            <Link href="/my/messages" className={`${LIFT_CARD_CLASS} flex items-center gap-3 p-4 sm:p-5`}>
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
            <SectionHeading title={m.teachersTitle} />
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

        {(hasEnrolment || home.feedback.length > 0) && (
          <section className="flex flex-col gap-6" data-my="feedback">
            <SectionHeading title={m.feedbackTitle} />
            {home.feedback.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
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
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
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
    <Link href={homeworkHref(h)} className={`${LIFT_CARD_CLASS} flex gap-3 p-4 sm:p-5`} data-homework-done={h.done}>
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

function NextCall({ lang, call }: { lang: SurfaceLang; call: NonNullable<LearnerHome["nextCall"]> }) {
  const m = myCopy[lang];
  return (
    <section className="flex flex-col gap-6" data-my="next-call">
      <SectionHeading title={m.nextCallTitle} />
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
  return (
    <Link href={`/courses/${course.slug}`} className={`${LIFT_CARD_CLASS} flex h-full gap-3 p-4 sm:p-5`}>
      <div className="relative size-16 flex-none overflow-hidden rounded-xl bg-muted">
        {course.coverImageUrl ? (
          <Image src={course.coverImageUrl} alt="" fill className="object-cover" sizes="64px" />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-brand-deep via-brand to-brand-accent">
            <span className="text-base font-semibold tracking-tight text-white/90">{course.level}</span>
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={SMALL_PILL_CLASS}>{course.level}</span>
          {latest && (
            <span className={MUTED_PILL_CLASS}>
              {latest.tier === "extended" ? m.tierExtended : m.tierBasic}
              {latest.runTitle && <> · {latest.runTitle}</>}
            </span>
          )}
        </div>
        <h3 className="text-sm font-semibold text-foreground sm:text-base">{course.title}</h3>
        {/* Two numbers, never blended (docs/handoff.md). The average is over
            attempted lessons only, so it is absent until one is attempted. */}
        <dl className="mt-auto flex flex-wrap gap-x-5 gap-y-1 pt-1">
          <div className="flex flex-col-reverse">
            <dt className="text-xs text-muted-foreground">{m.attempted}</dt>
            <dd className="text-base font-semibold text-foreground">
              {progress.attempted} {m.of} {progress.total}
            </dd>
          </div>
          {progress.averagePercent !== null && (
            <div className="flex flex-col-reverse">
              <dt className="text-xs text-muted-foreground">{m.average}</dt>
              <dd className="text-base font-semibold text-foreground">{progress.averagePercent}%</dd>
            </div>
          )}
        </dl>
      </div>
    </Link>
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
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
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
