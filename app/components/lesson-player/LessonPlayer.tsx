"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { LessonBlock, LessonDocument, LessonPracticeBlock } from "@/lib/lessons";
import { parseLessonDocument } from "@/lib/lessons";
import type { ItemScoreResult } from "@/lib/items";
import { explanationsForSession, scoreSession, type LessonSessionResults } from "@/lib/lessonPlayer/session";
import { lessonBlockWidth } from "@/lib/lessonPlayer/blockWidth";
import type { NextLessonLink } from "@/lib/publicLesson";
import { FIT_WIDTH_CLASS, HEADING_WIDTH_CLASS, LESSON_COLUMN_CLASS, READING_WIDTH_CLASS } from "./columnLayout";
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
    case "wide":
      return "";
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
   * submits a response. Recorded in local session state only — attempt
   * storage is M2, so nothing here reaches the network. */
  onScore: (result: ItemScoreResult) => void;
}

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
   * it — `crypto.randomUUID()` today (no attempt storage exists yet, M2), the
   * real server-issued attempt id once M2 lands. */
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
}

/**
 * PLAY-001 — the lesson player shell. Renders a parsed `LessonDocument`
 * block by block in authored order (docs/handoff.md: "structure inside a
 * lesson is short theory block, then a couple of exercises, repeated").
 * Holds per-item scores in local component state and rolls them into a
 * lesson-level result via `aggregateLessonScore` (0016, wrapped by
 * lib/lessonPlayer/session.ts) — nothing here is persisted; attempt storage
 * is M2.
 *
 * PLAY-008 — per-sub-part explanations ("Why?", resolved via
 * `resolveExplanations`/0017) are rendered by each per-type renderer
 * directly beneath the wrong sub-part, not here. This shell no longer reads
 * `explanationsForSession` at all; that function (lib/lessonPlayer/
 * session.ts, still tested in session.test.ts) is what PLAY-007's
 * end-of-lesson explanation review will call instead, over the full
 * lesson's `results`.
 */
export function LessonPlayer({
  document,
  attemptId,
  practiceRenderer,
  courseSlug = "",
  nextLesson = null,
}: LessonPlayerProps) {
  const parsed = useMemo(() => parseLessonDocument(document), [document]);
  const [results, setResults] = useState<LessonSessionResults>({});

  if (!parsed.ok) {
    return <LessonPlayerError errors={parsed.errors} />;
  }

  return (
    <LessonPlayerBody
      document={parsed.document}
      results={results}
      attemptId={attemptId}
      onScore={(itemId, result) => setResults((prev) => ({ ...prev, [itemId]: result }))}
      practiceRenderer={practiceRenderer}
      courseSlug={courseSlug}
      nextLesson={nextLesson}
    />
  );
}

function LessonPlayerBody({
  document,
  results,
  attemptId,
  onScore,
  practiceRenderer,
  courseSlug,
  nextLesson,
}: {
  document: LessonDocument;
  results: LessonSessionResults;
  attemptId: string;
  onScore: (itemId: string, result: ItemScoreResult) => void;
  practiceRenderer?: (props: PracticeRendererProps) => ReactNode;
  courseSlug: string;
  nextLesson: NextLessonLink | null;
}) {
  // Recomputed from `results` on every score, never accumulated by hand —
  // see lib/lessonPlayer/session.ts for why these stay pure functions over
  // the whole document rather than incremental updates.
  const lessonScore = scoreSession(document, results);

  return (
    <div className={LESSON_COLUMN_CLASS}>
      {lessonScore.status === "scored" && (
        <div
          className={`rounded-lg border border-brand-border bg-brand-subtle px-3 py-2 text-sm text-brand-text ${READING_WIDTH_CLASS}`}
        >
          Progress: {lessonScore.percent}% ({lessonScore.earned}/{lessonScore.possible})
        </div>
      )}
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
              {practiceRenderer ? (
                practiceRenderer({ block, attemptId, onScore: (result) => onScore(block.id, result) })
              ) : (
                <PracticeBlockPlaceholder block={block} />
              )}
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
        explanations={explanationsForSession(document, results)}
        courseSlug={courseSlug}
        nextLesson={nextLesson}
      />
    </div>
  );
}
