"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import type { LessonBlock, LessonDocument, LessonPracticeBlock } from "@/lib/lessons";
import { parseLessonDocument } from "@/lib/lessons";
import type { ItemScoreResult } from "@/lib/items";
import { alliengllCopy } from "@/lib/alliengll/copy";
import { createAttemptStore, uploadPendingAttempts, type AttemptStore } from "@/lib/lessonPlayer/attemptStore";
import {
  explanationsForSession,
  scoreSession,
  sessionProgress,
  type LessonSessionResults,
} from "@/lib/lessonPlayer/session";
import { fireFunnelEvent } from "@/lib/funnelSource";
import { lessonBlockWidth } from "@/lib/lessonPlayer/blockWidth";
import type { NextLessonLink } from "@/lib/publicLesson";
import {
  FIT_WIDTH_CLASS,
  HEADING_WIDTH_CLASS,
  LESSON_COLUMN_CLASS,
  PRACTICE_CARD_CLASS,
  READING_WIDTH_CLASS,
} from "./columnLayout";
import { LessonCompletion } from "./LessonCompletion";
import { LessonPlayerError } from "./LessonPlayerError";
import { PracticeBlockPlaceholder } from "./PracticeBlockPlaceholder";
import { TheoryBlockRenderer } from "./TheoryBlockRenderer";

/** `heading` gets its own wrapper class (centred, not just reading-width) —
 * see `HEADING_WIDTH_CLASS`'s doc comment for why this lives here rather
 * than inside `HeadingBlockView`. Every other width comes straight off
 * `lessonBlockWidth`. */
function widthClassFor(block: LessonBlock): string {
  if (block.kind === "theory" && block.type === "heading") {
    return HEADING_WIDTH_CLASS;
  }
  switch (lessonBlockWidth(block)) {
    case "reading":
      return READING_WIDTH_CLASS;
    case "fit":
      return FIT_WIDTH_CLASS;
  }
}

export interface PracticeRendererProps {
  block: LessonPracticeBlock;
  /** Seeds `lib/items/shuffle.ts`'s per-attempt-and-item presentation order
   * (PLAY-002 acceptance). Passed straight through from `LessonPlayerProps.
   * attemptId` — see that field's doc comment for why `LessonPlayer` does not
   * generate this itself. */
  attemptId: string;
  /** Called by a real per-type renderer (PLAY-002..004) once the learner
   * submits a response. Always updates local session state; ANON-005 adds a
   * best-effort record of the attempt for a signed-in learner (see
   * `LessonPlayer`'s own doc comment) — nothing here awaits or surfaces that
   * network call. */
  onScore: (result: ItemScoreResult) => void;
}

/** What `LessonPlayerProps.renderProgress` is handed (docs/decisions/0079
 * D5). `complete` means every practice block has a result.
 * `lessonScore.status === "scored"` can't say that: it turns true on the
 * FIRST answer (0058 Decision 1). `percent` is the running lesson score, or
 * null before any answer. */
export type LessonProgress = { answered: number; total: number; complete: boolean; percent: number | null };

export interface LessonPlayerProps {
  /** Raw, unparsed lesson document JSON — parsed here, on read, per
   * CNT-003/0018 Decision 2 ("the database is canonical", nothing reads a
   * pre-validated shape from elsewhere). */
  document: unknown;
  /** Seeds `lib/items/shuffle.ts` presentation order (docs/decisions/0029
   * Decision 1). MUST be unpredictable and distinct per learner/attempt —
   * `LessonPlayer` does not generate one itself (a prior version used
   * `useId()`, which is tree-position-derived, not random: every fresh
   * server-rendered load produced the SAME id for every visitor, making the
   * "shuffle" fixed per lesson rather than per attempt). The caller supplies
   * a fresh `crypto.randomUUID()` per page load — a shuffle seed only, never
   * the per-block `attempt_id` ANON-005's recording path generates
   * separately for `lesson_attempts`' own idempotency key. */
  attemptId: string;
  /** Renders one practice block and reports its score back. Defaults to a
   * placeholder — no item type has an interactive renderer until
   * PLAY-002..004 land. */
  practiceRenderer?: (props: PracticeRendererProps) => ReactNode;
  /** PLAY-007 — the completion screen's "next lesson" link needs the current
   * course's slug to build the destination path; both default to values that
   * render no completion footer content beyond the score/review, matching
   * pre-PLAY-007 behaviour for callers (tests, the demo page) that don't pass
   * them. */
  courseSlug?: string;
  nextLesson?: NextLessonLink | null;
  /** ANON-005 — the currently played lesson_versions.id, what a recorded
   * attempt is keyed against server-side. Defaults to "" (no recording),
   * matching pre-ANON-005 behaviour for callers (tests, the demo page, the
   * author preview) that don't pass it — none of those are a real learner
   * attempt worth persisting. */
  lessonVersionId?: string;
  /** ANON-005 — whether the caller already resolved an authenticated session
   * server-side (`lib/publicLesson.ts`'s `authUserFrom`). Defaults to false.
   * Recording never happens unless this is true AND `lessonVersionId` is set,
   * so passing one without the other is inert, not a half-broken state. */
  isSignedIn?: boolean;
  /** ANON-004 — this lesson's own path (`/courses/<courseSlug>/<lessonSlug>`),
   * threaded straight to the completion screen's registration offer so a
   * same-browser email confirmation or OAuth round trip returns here.
   * Defaults to "" (offer still renders, just returns to "/" on confirm). */
  lessonPath?: string;
  /** docs/decisions/0079 D5 — rendered immediately BEFORE the player's own
   * column, as a sibling of it, with the live answered/total counts. The
   * public lesson page passes its sticky progress strip here. The admin
   * preview, the demo and tests pass nothing and render nothing. */
  renderProgress?: (progress: LessonProgress) => ReactNode;
}

/**
 * PLAY-001 — the lesson player shell. Renders a parsed `LessonDocument`
 * block by block in authored order (docs/handoff.md: "structure inside a
 * lesson is short theory block, then a couple of exercises, repeated").
 * Holds per-item scores in local component state and rolls them into a
 * lesson-level result via `aggregateLessonScore` (0016, wrapped by
 * lib/lessonPlayer/session.ts). ANON-005 (below) adds persistence for a
 * signed-in learner; local state stays the source of truth for what's
 * rendered on this page load either way.
 *
 * PLAY-008 — per-sub-part explanations ("Why?", resolved via
 * `resolveExplanations`/0017) are rendered by each per-type renderer
 * directly beneath the wrong sub-part, not here. This shell no longer reads
 * `explanationsForSession` at all; that function (lib/lessonPlayer/
 * session.ts, still tested in session.test.ts) is what PLAY-007's
 * end-of-lesson explanation review will call instead, over the full
 * lesson's `results`.
 *
 * ANON-005 — a signed-in learner's score is also handed to
 * `lib/lessonPlayer/attemptStore.ts`'s already-built, already-tested store +
 * upload path (ANON-002/003): recorded locally, then immediately uploaded
 * through `record_lesson_attempts`. Reusing that path (rather than calling
 * the RPC straight from here) gets idempotent retry for free — a failed
 * upload simply leaves the attempt sitting in local storage, and the next
 * scored block's upload call retries the whole pending batch, not just the
 * new item (0063 Decision 4's "per-call failure handling", not a permanent
 * give-up flag). The Supabase browser client (`@supabase/ssr`) is imported
 * dynamically, only inside that upload call, so an anonymous visitor who
 * never triggers it never downloads it — the code path exists in this
 * bundle, but the chunk behind it doesn't ship unless `isSignedIn` is true
 * (docs/handoff.md's performance boundary: "no `@supabase/ssr` client JS on
 * the critical path" for an anonymous learner).
 *
 * ANON-004 — the same upload path also runs once on mount, not only from
 * `handleScore`, so a learner who finished a lesson anonymously and only
 * *then* gets a session (OAuth completing in this same browser, or a
 * same-browser email-confirmation click) has their already-scored local
 * attempts flushed too — see docs/decisions/0068 Decision 6. Idempotent on
 * `attemptId` either way, so this can never double-count against a
 * `handleScore`-triggered upload.
 */
export function LessonPlayer({
  document,
  attemptId,
  practiceRenderer,
  courseSlug = "",
  nextLesson = null,
  lessonVersionId = "",
  isSignedIn = false,
  lessonPath = "",
  renderProgress,
}: LessonPlayerProps) {
  const parsed = useMemo(() => parseLessonDocument(document), [document]);
  const [results, setResults] = useState<LessonSessionResults>({});
  const [attemptStore] = useState<AttemptStore>(() => createAttemptStore());

  useEffect(() => {
    if (!isSignedIn || !lessonVersionId) return;
    void recordSignedInAttempt(attemptStore);
  }, [isSignedIn, lessonVersionId, attemptStore]);

  // OPS-008 — lesson_start fires the moment the player opens (the attempt
  // is created), for EVERY learner including a fully anonymous one. Its own
  // effect, deliberately NOT folded into the recording effect above: that
  // one returns early when `!isSignedIn`, which would silently drop every
  // anonymous lesson_start — most of this surface's traffic.
  useEffect(() => {
    fireFunnelEvent("lesson_start", lessonPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  if (!parsed.ok) {
    return <LessonPlayerError errors={parsed.errors} />;
  }

  function handleScore(blockId: string, result: ItemScoreResult) {
    setResults((prev) => ({ ...prev, [blockId]: result }));

    if (!isSignedIn || !lessonVersionId) return;
    attemptStore.record({
      attemptId: crypto.randomUUID(),
      lessonVersionId,
      blockId,
      earned: result.earned,
      possible: result.possible,
    });
    void recordSignedInAttempt(attemptStore);
  }

  return (
    <LessonPlayerBody
      document={parsed.document}
      results={results}
      attemptId={attemptId}
      onScore={handleScore}
      practiceRenderer={practiceRenderer}
      courseSlug={courseSlug}
      nextLesson={nextLesson}
      lessonPath={lessonPath}
      isSignedIn={isSignedIn}
      renderProgress={renderProgress}
    />
  );
}

/** Dynamically imports the browser Supabase client so its `@supabase/ssr`
 * bundle only ships to a learner who actually reaches this call (see
 * `LessonPlayer`'s own doc comment). A failed upload is swallowed, not
 * surfaced to the learner — nothing here blocks or interrupts play, and the
 * attempt stays in `store` for the next scored block to retry. */
async function recordSignedInAttempt(store: AttemptStore): Promise<void> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    await uploadPendingAttempts(store, createClient());
  } catch (err) {
    console.error("failed to record lesson attempt", err);
  }
}

function LessonPlayerBody({
  document,
  results,
  attemptId,
  onScore,
  practiceRenderer,
  courseSlug,
  nextLesson,
  lessonPath,
  isSignedIn,
  renderProgress,
}: {
  document: LessonDocument;
  results: LessonSessionResults;
  attemptId: string;
  onScore: (itemId: string, result: ItemScoreResult) => void;
  practiceRenderer?: (props: PracticeRendererProps) => ReactNode;
  courseSlug: string;
  nextLesson: NextLessonLink | null;
  lessonPath: string;
  isSignedIn: boolean;
  renderProgress?: (progress: LessonProgress) => ReactNode;
}) {
  // Recomputed from `results` on every score, never accumulated by hand —
  // see lib/lessonPlayer/session.ts for why these stay pure functions over
  // the whole document rather than incremental updates.
  const lessonScore = scoreSession(document, results);
  const { answered, total } = sessionProgress(document, results);
  const progress: LessonProgress = {
    answered,
    total,
    complete: total > 0 && answered === total,
    percent: lessonScore.status === "scored" ? lessonScore.percent : null,
  };

  // OPS-008 — lesson_complete fires exactly once, on the transition into
  // "scored". Keyed on `lessonScore.status` rather than `results` itself, so
  // it does not re-fire on every subsequent answer once a lesson is already
  // fully scored (a lesson with no retake requirement can still re-render
  // this component many times after completion).
  useEffect(() => {
    if (lessonScore.status !== "scored") return;
    fireFunnelEvent("lesson_complete", lessonPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonScore.status]);

  // docs/decisions/0079 D6 — "Exercise N of M". N counts practice blocks
  // only, in document order, so it agrees with the "N заданий" the course
  // page shows (`published_item_count` = `countPracticeBlocks`).
  const practiceIds = document.filter((block) => block.kind === "practice").map((block) => block.id);
  const practiceNumber = new Map(practiceIds.map((id, index) => [id, index + 1]));

  // The score banner that used to open this column is gone
  // (docs/decisions/0079 D5): it appeared at the top of the page while the
  // learner was at the bottom. The running score now lives in the caller's
  // `renderProgress` strip and in LessonCompletion.
  return (
    <>
      {renderProgress?.(progress)}
      <div className={LESSON_COLUMN_CLASS}>
        {/* `contents` keeps every block a direct flex child of LESSON_COLUMN_CLASS
            (so `gap-4` still applies between blocks, not just around this
            wrapper) — it exists only so tests can scope a query to "the
            authored blocks" and distinguish an inline per-item explanation from
            PLAY-007's own copy of the same text in LessonCompletion's review
            section below. */}
        <div data-testid="lesson-blocks" className="contents">
          {document.map((block) => {
            const widthClass = widthClassFor(block);
            return block.kind === "practice" ? (
              <div key={block.id} className={widthClass}>
                <div className={PRACTICE_CARD_CLASS}>
                  <ExercisePill
                    number={practiceNumber.get(block.id) ?? 0}
                    total={practiceIds.length}
                    answered={results[block.id] !== undefined}
                  />
                  {practiceRenderer ? (
                    practiceRenderer({ block, attemptId, onScore: (result) => onScore(block.id, result) })
                  ) : (
                    <PracticeBlockPlaceholder block={block} />
                  )}
                </div>
              </div>
            ) : (
              <div key={block.id} className={widthClass}>
                <TheoryBlockRenderer block={block} />
              </div>
            );
          })}
        </div>
        <LessonCompletion
          score={lessonScore}
          progress={{ answered, total }}
          explanations={explanationsForSession(document, results)}
          courseSlug={courseSlug}
          nextLesson={nextLesson}
          lessonPath={lessonPath}
          isSignedIn={isSignedIn}
        />
      </div>
    </>
  );
}

/** The "Exercise N of M" pill at the top of every exercise card
 * (docs/decisions/0079 D6) — the landing demo card's label pill. Turns to
 * the success tokens with a ✓ once the exercise has a result, so a learner
 * scrolling back up can see which ones are done. It marks "answered",
 * never "correct" (docs/handoff.md: nothing demotivates the learner). */
function ExercisePill({ number, total, answered }: { number: number; total: number; answered: boolean }) {
  return (
    <p
      className={`mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        answered ? "bg-success-subtle text-success" : "bg-brand-subtle text-brand-text"
      }`}
    >
      {answered && <Check className="size-3.5" aria-hidden="true" />}
      {alliengllCopy.player.exerciseLabel} {number} {alliengllCopy.player.exerciseOf} {total}
    </p>
  );
}
