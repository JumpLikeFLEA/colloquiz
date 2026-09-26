"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Check, X } from "lucide-react";
import { resolveExplanations, scoreItem } from "@/lib/items";
import type { ItemScoreResult, MatchingItem } from "@/lib/items";
import type { MatchingContent, MatchingElement } from "@/lib/items/matching";
import { shuffleForItem } from "@/lib/items/shuffle";
import { buildMatchingResponse, clearMatchingPair, setMatchingPair } from "@/lib/lessonPlayer/matchingResponse";
import { ExplanationDisclosure } from "./ExplanationDisclosure";
import { MatchingContentView } from "./MatchingContentView";
import { useLessonPlayerSensors } from "./useLessonPlayerSensors";

/**
 * PLAY-011b/0060 — `matching` renderer for `presentation: "sort"`: statements
 * sorted into visible category buckets, not "tap to match" rows (partner
 * review note 5). Dispatched from `MatchingRenderer.tsx`, not a separate item
 * type or a separate lazy chunk — it is a rendering variant of `matching`
 * (docs/decisions/0060), so it shares that type's already-lazy chunk.
 *
 * State reuses the SAME `Map<leftId, rightId>` shape and the same
 * `setMatchingPair`/`clearMatchingPair`/`buildMatchingResponse` helpers
 * `MatchingRenderer` uses for `presentation: "pairs"` — a statement mapping
 * to a bucket is exactly the left->right pairing `score()` already consumes,
 * so no new pure-function code exists behind this component.
 * `moveMatchingPair`/`firstEmptyLeftId` are NOT used here: unlike a pairs row
 * (a fixed slot with an "empty" state), a bucket has no slot to be empty or
 * full, so "move a statement to a different bucket" is just overwriting its
 * map entry (`setMatchingPair`), not a distinct operation.
 *
 * Topology — INVERTS docs/decisions/0039 Decision 2. There, the risk was a
 * shrinking BANK (the pool learners drag *from*) letting the last unplaced
 * row be solved by elimination, so the bank/right side was made
 * non-consumable and the row/left side filled up one at a time. Here the
 * pool learners drag from is the STATEMENTS (left), and they genuinely are
 * used up one placement at a time — a statement renders in exactly one
 * place (pool or its bucket), a single consumable draggable node, the same
 * "chip is consumed, not dual-noded" shape `slots.ts`'s `DragSlots` already
 * uses for its 1:1 gap/chip pairing (0032 Decision 3) rather than matching's
 * reusable-bank shape. What must NOT shrink here is the other side: every
 * BUCKET (right) stays a valid drop target for every remaining statement, so
 * a learner can never solve the last statement by "only one bucket is still
 * open" — buckets never close, disable, or filter regardless of what they
 * already hold.
 *
 * Buckets are rendered in AUTHORED order (never shuffled) — they are column
 * headers, not answer options, the same reason `matching`'s own `left` side
 * is never shuffled. The statement pool IS shuffled (`shuffleForItem`),
 * mirroring why the old bank was: unshuffled statement order could leak
 * grouping (e.g. every past-simple example authored before every
 * present-perfect one).
 */

const POOL_DROPPABLE_ID = "__bucket_pool__";

export function BucketRenderer({
  item,
  attemptId,
  onScore,
}: {
  item: MatchingItem;
  attemptId: string;
  onScore: (result: ItemScoreResult) => void;
}) {
  const statements = useMemo(
    () => shuffleForItem(item.payload.left, attemptId, item.id),
    [item, attemptId],
  );
  const buckets = item.payload.right;
  const statementById = useMemo(() => new Map(item.payload.left.map((e) => [e.id, e])), [item]);
  const bucketById = useMemo(() => new Map(item.payload.right.map((e) => [e.id, e])), [item]);
  const pairByLeftId = useMemo(() => new Map(item.payload.pairs.map((pair) => [pair.left, pair])), [item]);

  const [pairs, setPairs] = useState<Map<string, string>>(new Map());
  const [activeStatement, setActiveStatement] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [result, setResult] = useState<ItemScoreResult | null>(null);
  const submitted = result !== null;

  const subResultByPairId = new Map(result?.subResults.map((r) => [r.id, r]));
  const explanationByPairId = new Map(
    result ? resolveExplanations(item, result).map((e) => [e.subResultId, e.explanation]) : [],
  );

  const sensors = useLessonPlayerSensors();

  function submit() {
    const scored = scoreItem(item, buildMatchingResponse(pairs));
    setResult(scored);
    onScore(scored);
  }

  function placeActiveInBucket(bucketId: string) {
    if (!activeStatement) return; // selecting a bucket first does nothing
    setPairs((prev) => setMatchingPair(prev, activeStatement, bucketId));
    setActiveStatement(null);
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    const { active, over } = event;
    if (!over) return;
    const statementId = active.id as string;
    if (over.id === POOL_DROPPABLE_ID) {
      setPairs((prev) => clearMatchingPair(prev, statementId));
    } else {
      setPairs((prev) => setMatchingPair(prev, statementId, over.id as string));
    }
  }

  const placedByBucket = new Map<string, string[]>();
  for (const bucket of buckets) placedByBucket.set(bucket.id, []);
  for (const statement of statements) {
    const bucketId = pairs.get(statement.id);
    if (bucketId && placedByBucket.has(bucketId)) placedByBucket.get(bucketId)!.push(statement.id);
  }
  const unplacedStatements = statements.filter((s) => !pairs.has(s.id));

  function feedbackFor(statementId: string): { correct: boolean; note?: string; explanation?: string } | undefined {
    if (!submitted) return undefined;
    const pair = pairByLeftId.get(statementId);
    if (!pair) return undefined;
    const subResult = subResultByPairId.get(pair.id);
    if (!subResult) return undefined;
    if (subResult.correct) return { correct: true };
    const correctBucket = bucketById.get(pair.right);
    const note = correctBucket ? contentToText(correctBucket.content) : undefined;
    return { correct: false, note, explanation: explanationByPairId.get(subResult.id) };
  }

  const draggingStatement = draggingId ? statementById.get(draggingId) : undefined;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-3 text-sm font-medium text-foreground">{item.payload.prompt}</p>
      <DndContext
        id={`bucket-${attemptId}:${item.id}`}
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDraggingId(null)}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {buckets.map((bucket) => (
            <Bucket
              key={bucket.id}
              bucket={bucket}
              placedStatementIds={placedByBucket.get(bucket.id) ?? []}
              statementById={statementById}
              submitted={submitted}
              activeStatement={activeStatement}
              onTapBucket={() => placeActiveInBucket(bucket.id)}
              onTapStatement={(id) => setActiveStatement((prev) => (prev === id ? null : id))}
              feedbackFor={feedbackFor}
            />
          ))}
        </div>
        <Pool
          statementIds={unplacedStatements.map((s) => s.id)}
          statementById={statementById}
          submitted={submitted}
          activeStatement={activeStatement}
          onTapStatement={(id) => setActiveStatement((prev) => (prev === id ? null : id))}
          feedbackFor={feedbackFor}
        />
        {!submitted && activeStatement && pairs.has(activeStatement) && (
          <button
            type="button"
            onClick={() => {
              setPairs((prev) => clearMatchingPair(prev, activeStatement));
              setActiveStatement(null);
            }}
            className="mt-3 min-h-11 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors cursor-pointer hover:border-destructive-border"
          >
            Return to pool
          </button>
        )}
        <DragOverlay>
          {draggingStatement ? <ChipPreview content={draggingStatement.content} /> : null}
        </DragOverlay>
      </DndContext>
      {!submitted && (
        <button
          type="button"
          onClick={submit}
          className="mt-3 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover cursor-pointer transition-colors"
        >
          Submit
        </button>
      )}
    </div>
  );
}

function contentToText(content: MatchingContent): string | undefined {
  return content.kind === "text" ? content.text : undefined;
}

/** A category bucket: always a valid droppable target (never disabled or
 * filtered, per this file's topology note), growing with its contents —
 * no fixed or max height. Its header is also the tap target for "place the
 * active statement here." */
function Bucket({
  bucket,
  placedStatementIds,
  statementById,
  submitted,
  activeStatement,
  onTapBucket,
  onTapStatement,
  feedbackFor,
}: {
  bucket: MatchingElement;
  placedStatementIds: string[];
  statementById: Map<string, MatchingElement>;
  submitted: boolean;
  activeStatement: string | null;
  onTapBucket: () => void;
  onTapStatement: (id: string) => void;
  feedbackFor: (id: string) => { correct: boolean; note?: string; explanation?: string } | undefined;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: bucket.id, disabled: submitted });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-2 rounded-lg border p-2 transition-colors ${
        !submitted && isOver ? "border-brand bg-brand-subtle/30" : "border-border bg-background"
      }`}
    >
      <button
        type="button"
        onClick={onTapBucket}
        disabled={submitted}
        className="min-h-11 rounded-md px-2 py-1 text-left text-sm font-medium text-foreground disabled:cursor-not-allowed"
      >
        <MatchingContentView content={bucket.content} />
      </button>
      <div className="flex flex-col gap-1">
        {placedStatementIds.map((id) => {
          const statement = statementById.get(id);
          if (!statement) return null;
          const feedback = feedbackFor(id);
          return (
            <StatementChip
              key={id}
              statement={statement}
              submitted={submitted}
              active={activeStatement === id}
              feedback={feedback}
              onTap={() => onTapStatement(id)}
            />
          );
        })}
      </div>
    </div>
  );
}

/** The unplaced-statement pool — always visible, also a droppable target so
 * a placed statement can be dragged back out of its bucket. */
function Pool({
  statementIds,
  statementById,
  submitted,
  activeStatement,
  onTapStatement,
  feedbackFor,
}: {
  statementIds: string[];
  statementById: Map<string, MatchingElement>;
  submitted: boolean;
  activeStatement: string | null;
  onTapStatement: (id: string) => void;
  feedbackFor: (id: string) => { correct: boolean; note?: string; explanation?: string } | undefined;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: POOL_DROPPABLE_ID, disabled: submitted });

  return (
    <div
      ref={setNodeRef}
      className={`mt-3 flex min-h-14 flex-wrap items-start gap-2 border-t p-2 transition-colors ${
        !submitted && isOver ? "border-brand bg-brand-subtle/30" : "border-border"
      }`}
    >
      {statementIds.length === 0 && submitted === false && (
        <span className="px-1 text-xs text-muted-foreground">All statements sorted</span>
      )}
      {statementIds.map((id) => {
        const statement = statementById.get(id);
        if (!statement) return null;
        const feedback = feedbackFor(id);
        return (
          <StatementChip
            key={id}
            statement={statement}
            submitted={submitted}
            active={activeStatement === id}
            feedback={feedback}
            onTap={() => onTapStatement(id)}
          />
        );
      })}
    </div>
  );
}

/** A statement — the single consumable draggable node for its id, rendered
 * either in the pool or inside the bucket it's placed in, never both. When
 * submitted and wrong, stays exactly where the learner put it (never moved)
 * with a "Correct: <bucket>" note and the standard PLAY-008 "Why?"
 * disclosure beneath it. */
function StatementChip({
  statement,
  submitted,
  active,
  feedback,
  onTap,
}: {
  statement: MatchingElement;
  submitted: boolean;
  active: boolean;
  feedback: { correct: boolean; note?: string; explanation?: string } | undefined;
  onTap: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: statement.id,
    disabled: submitted,
  });
  const style = { transform: CSS.Translate.toString(transform), touchAction: "none" };

  return (
    <div className="flex flex-col gap-1">
      <button
        ref={setNodeRef}
        style={style}
        type="button"
        disabled={submitted}
        onClick={onTap}
        className={`flex min-h-11 items-center gap-1.5 rounded-md border px-3 py-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed ${
          isDragging ? "opacity-40" : "cursor-grab"
        } ${feedbackBorderClassName({ submitted, correct: feedback?.correct })} ${
          !submitted && active ? "border-brand bg-brand-subtle" : ""
        }`}
        {...attributes}
        {...listeners}
      >
        <MatchingContentView content={statement.content} inline className="min-w-0" />
        {submitted &&
          feedback &&
          (feedback.correct ? (
            <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <X className="size-4 shrink-0 text-destructive-text" aria-hidden="true" />
          ))}
      </button>
      {submitted && feedback && !feedback.correct && (
        <div className="flex flex-col gap-0.5 pl-1">
          {feedback.note && <span className="text-xs text-muted-foreground">Correct: {feedback.note}</span>}
          {feedback.explanation && <ExplanationDisclosure explanation={feedback.explanation} />}
        </div>
      )}
    </div>
  );
}

function feedbackBorderClassName({
  submitted,
  correct,
}: {
  submitted: boolean;
  correct: boolean | undefined;
}): string {
  if (!submitted) return "border-border bg-card";
  if (correct === undefined) return "border-border bg-card opacity-70";
  return correct ? "border-success-border bg-success-subtle" : "border-destructive-border bg-destructive-subtle";
}

/** The floating clone `DragOverlay` renders at the pointer while a statement
 * is lifted, from either the pool or a bucket. */
function ChipPreview({ content }: { content: MatchingContent }) {
  return (
    <div className="min-h-11 rounded-md border border-brand bg-card px-3 py-1.5 text-sm text-foreground shadow-lg">
      <MatchingContentView content={content} inline />
    </div>
  );
}
