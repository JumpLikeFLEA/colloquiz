import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFinalScreen } from "@/lib/finalScreen";
import { getSignedInAccount } from "@/lib/signedInAccount";
import type { FinalCommentView, SlotView } from "@/lib/voice/beforeAfter";
// Direct paths, not the lesson-player barrel (docs/decisions/0059).
import { LESSON_READING_FRAME_CLASS } from "@/app/components/lesson-player/columnLayout";
import { InlineContentView } from "@/app/components/lesson-player/InlineContent";
import { FeedbackContentView } from "@/app/components/lesson-player/blocks/FeedbackContentView";
import { SUBMIT_BUTTON_CLASS } from "@/app/components/lesson-player/practice/practiceClasses";
import { SignedAudio } from "@/app/components/voice/SignedAudio";
import { AccountMenu } from "../../AccountMenu";
import { BandTopBar } from "../../BandTopBar";
import { GradientBackdrop } from "../../HeroDecor";
import { GLASS_PILL_CLASS, GRADIENT_BAND_CLASS, HERO_ENTER_CLASS } from "../../surfaceClasses";
import { finalCopy } from "./finalCopy";

export const metadata: Metadata = { title: finalCopy.metaTitle, robots: { index: false } };

// The exercise card's shape (rounded-2xl, border, shadow-sm, p-4 sm:p-5)
// and the voice recorder's notice (VoiceRecorder.tsx), so a state here
// reads like the same state on the lesson page.
const CARD_CLASS = "flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5";
const NOTICE_CLASS = "text-sm text-muted-foreground";

/**
 * COH-005 (docs/decisions/0115) — the before/after screen for one run: the
 * learner's "before" and "after" takes side by side, then the partner's
 * final comment. English, no toggle. Every state is decided by
 * lib/voice/beforeAfter.ts over reads lib/finalScreen.ts makes under the
 * caller's own session:
 *
 *   signed out            → a sign-in card, `next` = here
 *   not enrolled / revoked / no such run → 404
 *   per slot: recorded (player) · removed by the 6-month purge ("removed",
 *   never "missing") · missing (link to the lesson) · unknown (its lesson
 *   isn't open yet)
 *   comment: published (the feedback box) · pending
 *
 * Top-level, not under /courses/[courseSlug]: a static segment there would
 * catch the sub-routes (opengraph-image) of a lesson slugged the same way
 * (0115 Decision 1). A Server
 * Component; the only client JS it adds is SignedAudio.
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

  return (
    <main className="flex flex-1 flex-col bg-background" data-final-state={screen.state}>
      <section className={GRADIENT_BAND_CLASS}>
        <GradientBackdrop />
        <div className={`${LESSON_READING_FRAME_CLASS} relative flex flex-col gap-8 pb-10 pt-5 sm:pb-12 lg:pt-6`}>
          <BandTopBar
            back={{ href: `/courses/${screen.courseSlug}`, label: finalCopy.backToCourse }}
            account={signedIn && <AccountMenu email={signedIn.email} studio={signedIn.isEditor} unread={signedIn.unreadMessages} lang="en" next={here} />}
          />
          <div className={`${HERO_ENTER_CLASS} flex flex-col items-start gap-3`}>
            <span className={GLASS_PILL_CLASS}>{finalCopy.eyebrow}</span>
            <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              {screen.courseTitle}
            </h1>
            {screen.runTitle && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className={GLASS_PILL_CLASS}>{screen.runTitle}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className={`${LESSON_READING_FRAME_CLASS} flex flex-col gap-6 py-10 sm:py-12`}>
        {screen.state === "signed_out" ? (
          <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-10 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">{finalCopy.signedOut.title}</h2>
            <p className="max-w-sm text-base text-muted-foreground">{finalCopy.signedOut.body}</p>
            <Link href={`/login?${new URLSearchParams({ next: here }).toString()}`} className={SUBMIT_BUTTON_CLASS}>
              {finalCopy.signedOut.cta}
            </Link>
          </section>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{finalCopy.intro}</p>
              {prompt && (
                <p className="text-base font-semibold text-foreground">
                  <InlineContentView content={prompt} />
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SlotCard label={finalCopy.before} slot={screen.view.before} which="before" playback={screen.playback} courseSlug={screen.courseSlug} />
              <SlotCard label={finalCopy.after} slot={screen.view.after} which="after" playback={screen.playback} courseSlug={screen.courseSlug} />
            </div>
            <CommentCard comment={screen.view.comment} />
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
      <span className="inline-flex w-fit items-center rounded-full bg-brand-subtle px-2.5 py-1 text-xs font-semibold text-brand-text">
        {label}
      </span>
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
      <h2 className="text-base font-semibold text-foreground">{finalCopy.comment.heading}</h2>
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
