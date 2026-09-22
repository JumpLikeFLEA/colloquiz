"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { LessonDocument, LessonPracticeBlock } from "@/lib/lessons";
import { parseLessonDocument } from "@/lib/lessons";
import type { ItemScoreResult } from "@/lib/items";
import { explanationsForSession, scoreSession, type LessonSessionResults } from "@/lib/lessonPlayer/session";
import { LessonPlayerError } from "./LessonPlayerError";
import { PracticeBlockPlaceholder } from "./PracticeBlockPlaceholder";
import { TheoryBlockRenderer } from "./TheoryBlockRenderer";

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
}

/**
 * PLAY-001 — the lesson player shell. Renders a parsed `LessonDocument`
 * block by block in authored order (docs/handoff.md: "structure inside a
 * lesson is short theory block, then a couple of exercises, repeated").
 * Holds per-item scores in local component state and rolls them into a
 * lesson-level result via `aggregateLessonScore`/`resolveExplanations`
 * (0016/0017, wrapped by lib/lessonPlayer/session.ts) — nothing here is
 * persisted; attempt storage is M2.
 */
export function LessonPlayer({ document, attemptId, practiceRenderer }: LessonPlayerProps) {
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
    />
  );
}

function LessonPlayerBody({
  document,
  results,
  attemptId,
  onScore,
  practiceRenderer,
}: {
  document: LessonDocument;
  results: LessonSessionResults;
  attemptId: string;
  onScore: (itemId: string, result: ItemScoreResult) => void;
  practiceRenderer?: (props: PracticeRendererProps) => ReactNode;
}) {
  // Recomputed from `results` on every score, never accumulated by hand —
  // see lib/lessonPlayer/session.ts for why these stay pure functions over
  // the whole document rather than incremental updates.
  const lessonScore = scoreSession(document, results);
  const explanations = explanationsForSession(document, results);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-4">
      {lessonScore.status === "scored" && (
        <div className="rounded-lg border border-brand-border bg-brand-subtle px-3 py-2 text-sm text-brand-text">
          Progress: {lessonScore.percent}% ({lessonScore.earned}/{lessonScore.possible})
        </div>
      )}
      {document.map((block) =>
        block.kind === "practice" ? (
          <div key={block.id}>
            {practiceRenderer ? (
              practiceRenderer({ block, attemptId, onScore: (result) => onScore(block.id, result) })
            ) : (
              <PracticeBlockPlaceholder block={block} />
            )}
            {explanations.get(block.id)?.map((resolved) => (
              <p key={resolved.subResultId} className="mt-1 text-xs text-destructive-text">
                {resolved.explanation}
              </p>
            ))}
          </div>
        ) : (
          <div key={block.id}>
            <TheoryBlockRenderer block={block} />
          </div>
        ),
      )}
    </div>
  );
}
