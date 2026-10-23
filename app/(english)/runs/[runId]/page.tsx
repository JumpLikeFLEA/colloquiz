import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getFinalScreen } from "@/lib/finalScreen";
import { getSignedInAccount } from "@/lib/signedInAccount";
import { voiceAnalysisCopy } from "@/lib/alliengll/voiceAnalysisCopy";
import type { FinalAnalysisView } from "@/lib/voice/analysis/finalView";
import { getFinalAnalysis } from "@/lib/voice/analysis/learnerRead";
import type { FinalCommentView, SlotView } from "@/lib/voice/beforeAfter";
// Direct paths, not the lesson-player barrel (docs/decisions/0059).
import { LESSON_HEADER_COLUMN_CLASS } from "@/app/components/lesson-player/columnLayout";
import { InlineContentView } from "@/app/components/lesson-player/InlineContent";
import { FeedbackContentView } from "@/app/components/lesson-player/blocks/FeedbackContentView";
import { SignedAudio } from "@/app/components/voice/SignedAudio";
import { AccountMenu } from "../../AccountMenu";
import { BandTopBar } from "../../BandTopBar";
import { HERO_ENTER_CLASS, OFFSET_CTA_CLASS, PAPER_PANEL_CLASS, PAPER_PILL_CLASS, PAPER_PILL_HIGHLIGHT_CLASS } from "../../surfaceClasses";
import { finalCopy } from "./finalCopy";

export const metadata: Metadata = { title: finalCopy.metaTitle, robots: { index: false } };

// The analysis view is a client component with its own chunk. Loaded lazily, it is requested only
// by a page that renders it: a signed-out visitor, a recording with no feedback and the mode `off`
// download none of it (PROG-007, docs/decisions/0191 "Budget").
const AnalysisResult = dynamic(() =>
  import("@/app/components/lesson-player/blocks/analysis/AnalysisResult").then((m) => m.AnalysisResult),
);

// A card on the Alina Cher grid paper (PROG-007, docs/decisions/0191): the ink frame and offset
// shadow every other paper page uses (0166). Its inner padding is the exercise card's, so a state
// here reads like the same state on the lesson page.
const CARD_CLASS = `${PAPER_PANEL_CLASS} flex flex-col gap-3 p-4 sm:p-5`;
const NOTICE_CLASS = "text-sm text-muted-foreground";
// Blocks sit at the lesson page's reading width, left-aligned under the hero's text (0079 D1);
// the analysis and the comment, side by side at `lg`, use the whole column.
const READING_WIDTH_CLASS = "lg:max-w-[44rem]";

/**
 * COH-005 (docs/decisions/0115) — the before/after screen for one run: the
 * learner's "before" and "after" takes side by side, then the AI feedback on
 * the "after" take beside the partner's final comment. English, no toggle.
 * Every state is decided by lib/voice/beforeAfter.ts over reads
 * lib/finalScreen.ts makes under the caller's own session:
 *
 *   signed out            → a sign-in card, `next` = here
 *   not enrolled / revoked / no such run → 404
 *   per slot: recorded (player) · removed by the 6-month purge ("removed",
 *   never "missing") · missing (link to the lesson) · unknown (its lesson
 *   isn't open yet)
 *   comment: published (the feedback box) · pending
 *   AI feedback (PROG-007, docs/decisions/0191): only for a recorded "after"
 *   take, and only while VOICE_ANALYSIS_MODE is not `off`; every state is
 *   readAnalysisStatus's (the lesson page's own), seen once, not polled.
 *
 * Top-level, not under /courses/[courseSlug]: a static segment there would
 * catch the sub-routes (opengraph-image) of a lesson slugged the same way
 * (0115 Decision 1). A Server Component; the client JS it adds is
 * SignedAudio and, only when an analysis is drawn, the analysis view.
 */
export default async function FinalScreenPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const [screen, signedIn] = await Promise.all([getFinalScreen(runId), getSignedInAccount()]);
  if (screen.state === "not_found") notFound();

  const here = `/runs/${screen.runId}`;
  const prompt =
    screen.state === "ok"
      ? (slotPrompt(screen.view.before) ?? slotPrompt(screen.view.after))
      : null;
  const analysis: FinalAnalysisView =
    screen.state === "ok" && screen.view.after.kind === "recorded"
      ? await getFinalAnalysis(screen.view.after.takeId)
      : { kind: "none" };
  const afterLessonHref =
    screen.state === "ok" && screen.view.after.kind === "recorded" && screen.view.after.location.linkable
      ? `/courses/${screen.courseSlug}/${screen.view.after.location.slug}`
      : null;

  return (
    <main className="grid-paper flex flex-1 flex-col" data-final-state={screen.state}>
      <section>
        <div className={`${LESSON_HEADER_COLUMN_CLASS} relative flex flex-col gap-8 pb-8 pt-5 sm:pb-10 lg:pt-6`}>
          <BandTopBar
           
            back={{ href: `/courses/${screen.courseSlug}`, label: finalCopy.backToCourse }}
            account={signedIn && <AccountMenu email={signedIn.email} username={signedIn.username} studio={signedIn.isEditor} unread={signedIn.unreadMessages} lang="en" next={here} />}
          />
          <div className={`${HERO_ENTER_CLASS} flex flex-col items-start gap-3`}>
            <span className={PAPER_PILL_HIGHLIGHT_CLASS}>{finalCopy.eyebrow}</span>
            <h1 className="text-balance font-display text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
              {screen.courseTitle}
            </h1>
            {screen.runTitle && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className={PAPER_PILL_CLASS}>{screen.runTitle}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className={`${LESSON_HEADER_COLUMN_CLASS} flex w-full flex-col gap-6 pb-12 pt-4 sm:pb-16`}>
        {screen.state === "signed_out" ? (
          <section className={`${PAPER_PANEL_CLASS} flex flex-col items-center gap-4 px-6 py-10 text-center ${READING_WIDTH_CLASS}`}>
            <h2 className="font-display text-lg font-extrabold text-foreground">{finalCopy.signedOut.title}</h2>
            <p className="max-w-sm text-base text-muted-foreground">{finalCopy.signedOut.body}</p>
            <Link href={`/login?${new URLSearchParams({ next: here }).toString()}`} className={OFFSET_CTA_CLASS}>
              {finalCopy.signedOut.cta}
            </Link>
          </section>
        ) : (
          <>
            <div className={`flex flex-col gap-2 ${READING_WIDTH_CLASS}`}>
              <p className="text-sm text-muted-foreground">{finalCopy.intro}</p>
              {prompt && (
                <p className="text-base font-semibold text-foreground">
                  <InlineContentView content={prompt} />
                </p>
              )}
            </div>
            <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${READING_WIDTH_CLASS}`}>
              <SlotCard label={finalCopy.before} slot={screen.view.before} which="before" playback={screen.playback} courseSlug={screen.courseSlug} />
              <SlotCard label={finalCopy.after} slot={screen.view.after} which="after" playback={screen.playback} courseSlug={screen.courseSlug} />
            </div>
            {/* The AI feedback sits beside the final comment from `lg`, under it on a phone.
                With no analysis the comment keeps the reading width it always had. */}
            <div className={analysis.kind === "none" ? READING_WIDTH_CLASS : "grid grid-cols-1 items-start gap-6 lg:grid-cols-2"}>
              {analysis.kind !== "none" && <AnalysisCard view={analysis} lessonHref={afterLessonHref} />}
              <CommentCard comment={screen.view.comment} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function slotPrompt(slot: SlotView) {
  return slot.kind === "unknown" ? null : slot.location.prompt;
}

function SlotCard({
  label,
  slot,
  which,
  playback,
  courseSlug,
}: {
  label: string;
  slot: SlotView;
  which: "before" | "after";
  playback: Record<string, string>;
  courseSlug: string;
}) {
  return (
    <section className={CARD_CLASS} data-slot={which} data-slot-state={slot.kind}>
      <span className={`w-fit ${which === "after" ? PAPER_PILL_HIGHLIGHT_CLASS : PAPER_PILL_CLASS}`}>{label}</span>
      {slot.kind === "recorded" ? (
        <SignedAudio submissionId={slot.takeId} initialUrl={playback[slot.takeId] ?? null} />
      ) : slot.kind === "removed" ? (
        <p className={NOTICE_CLASS}>{finalCopy.removed}</p>
      ) : slot.kind === "missing" ? (
        <>
          <p className={NOTICE_CLASS}>{finalCopy.missing}</p>
          <p className="text-sm text-foreground">
            {finalCopy.recordIn}{" "}
            {slot.location.linkable ? (
              <Link
                href={`/courses/${courseSlug}/${slot.location.slug}`}
                className="font-medium text-brand-text underline-offset-4 hover:underline"
              >
                {slot.location.title}
              </Link>
            ) : (
              <span className="font-medium">{slot.location.title}</span>
            )}
            .
          </p>
        </>
      ) : (
        <p className={NOTICE_CLASS}>{finalCopy.unknown[which]}</p>
      )}
    </section>
  );
}

function CommentCard({ comment }: { comment: FinalCommentView }) {
  return (
    <section className={CARD_CLASS} data-comment-state={comment.kind}>
      <h2 className="font-display text-base font-extrabold text-foreground">{finalCopy.comment.heading}</h2>
      {comment.kind === "published" ? (
        <div className="rounded-xl bg-brand-subtle px-4 py-3 text-sm text-foreground">
          <FeedbackContentView content={comment.body} />
        </div>
      ) : (
        <p className={NOTICE_CLASS}>{finalCopy.comment.pending}</p>
      )}
    </section>
  );
}

// The final take's AI feedback. Everything stored is a React text child inside AnalysisResult
// (0189 Decision 7); the label sits on every state, as the privacy policy §12 promises.
function AnalysisCard({ view, lessonHref }: { view: Exclude<FinalAnalysisView, { kind: "none" }>; lessonHref: string | null }) {
  const c = voiceAnalysisCopy;
  const message: { title?: string; body: string } | null =
    view.kind === "working"
      ? { body: finalCopy.analysis.working }
      : view.kind === "failed"
        ? { title: c.failedTitle, body: c.failedBody }
        : view.kind === "withdrawn"
          ? { title: c.withdrawnTitle, body: c.withdrawnBody }
          : view.kind === "paused"
            ? { title: c.pausedTitle, body: c.pausedBody }
            : view.kind === "limit"
              ? // /runs is a cohort screen, so this is the cohort wording (0189 Decision 9).
                { body: c.limit }
              : null;
  return (
    <section className={CARD_CLASS} data-analysis-state={view.kind} aria-label={c.label}>
      <h2 className="flex flex-wrap items-center gap-2 font-display text-base font-extrabold text-foreground">
        <Sparkles className="size-4 text-brand-text" aria-hidden="true" />
        {finalCopy.analysis.heading}
      </h2>
      {view.kind === "done" ? (
        <>
          <AnalysisResult analysis={view.analysis} transcript={view.transcript} baseline={view.baseline} />
          <p className="text-xs text-muted-foreground">{c.disclaimer}</p>
        </>
      ) : (
        message && (
          <div className="flex flex-col gap-1">
            {message.title && <p className="text-sm font-semibold text-foreground">{message.title}</p>}
            <p className={NOTICE_CLASS}>{message.body}</p>
          </div>
        )
      )}
      {lessonHref && (
        <Link href={lessonHref} className="w-fit text-sm font-medium text-brand-text underline-offset-4 hover:underline">
          {finalCopy.analysis.openLesson}
        </Link>
      )}
    </section>
  );
}
