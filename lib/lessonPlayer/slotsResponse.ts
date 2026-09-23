import type { SlotsResponse } from "../items/slots";

/**
 * PLAY-004 — pure state-transition and response-building helpers behind the
 * `slots` renderer. Same jsdom-avoidance precedent as
 * lib/lessonPlayer/selectionResponse.ts / orderingResponse.ts / matchingResponse.ts.
 *
 * `slots.ts`'s own header leaves "how a gap's position within the prompt
 * text is conveyed to a renderer" undecided — `splitPromptOnGaps` is this
 * card's answer: the authored `prompt` carries one literal `"___"` per gap,
 * in gap order, and the renderer interleaves `gaps` between the resulting
 * text segments. See docs/decisions/0031.
 *
 * Two independent response builders exist because `typed` and `drag` are
 * genuinely different STATE shapes (free text vs. a chip placement), not
 * because scoring differs — both ultimately produce the same `SlotsResponse`
 * and go through the identical `scoreItem` -> `slots.ts` normalisation path,
 * which is what makes "typed and drag score identically" (this card's
 * acceptance) hold by construction rather than by a UI-level comparison.
 */

/**
 * Splits `prompt` on every literal `"___"` occurrence. Returns the segments
 * (length `gapCount + 1`) only when the prompt contains EXACTLY `gapCount`
 * occurrences — the number of gaps a renderer can place, one per split
 * point. Returns `null` otherwise (a malformed/miscounted prompt), which the
 * renderer reads as "fall back to a non-inline gap list" rather than
 * silently misplacing a gap against the wrong point in the sentence.
 */
export function splitPromptOnGaps(prompt: string, gapCount: number): string[] | null {
  const segments = prompt.split("___");
  return segments.length === gapCount + 1 ? segments : null;
}

// --- typed input ------------------------------------------------------

export function setGapAnswer(answers: ReadonlyMap<string, string>, gapId: string, value: string): Map<string, string> {
  const next = new Map(answers);
  next.set(gapId, value);
  return next;
}

export function clearGapAnswer(answers: ReadonlyMap<string, string>, gapId: string): Map<string, string> {
  const next = new Map(answers);
  next.delete(gapId);
  return next;
}

/** `answers` maps gap id to the learner's raw typed text. A gap absent from
 * the map is untouched — `slots.ts`'s `score` already scores that as
 * incorrect, not excluded, so this builder need not invent a placeholder. */
export function buildSlotsResponse(answers: ReadonlyMap<string, string>): SlotsResponse {
  return [...answers.entries()].map(([gapId, answer]) => ({ gapId, answer }));
}

/**
 * Width (in `ch`) for a typed gap's inline `<input>` — docs/decisions/0032's
 * inline-input sizing rule: the longest accepted answer, plus `paddingCh` of
 * breathing room, floored at `minCh` so a one-letter answer doesn't render as
 * a sliver. There is deliberately no upper clamp here — the renderer caps
 * the input's visual width with `max-width: 100%` of its line instead, so a
 * genuinely long answer wraps onto its own line rather than being squeezed
 * (squeezing would hide MORE about the answer's length via scroll/overflow
 * cues, not less).
 */
export function gapInputWidthCh(acceptedAnswers: readonly string[], minCh = 5, paddingCh = 2): number {
  const longest = acceptedAnswers.reduce((max, answer) => Math.max(max, answer.length), 0);
  return Math.max(longest + paddingCh, minCh);
}

// --- drag input ---------------------------------------------------------

/**
 * `placedChip` maps gap id -> chip id (one chip per gap, keyed by the
 * originating gap's own id — see SlotsRenderer). A chip pairing is 1:1 and
 * CONSUMED once placed — the opposite of `matchingResponse.ts`'s
 * deliberately reusable right-side pool (0013 makes matching many-to-one;
 * a slots gap/chip pairing has exactly as many chips as gaps, one blank per
 * word). `moveChipToGap`/`moveChipToBank` are the only two state
 * transitions, and BOTH the tap flow (tap a gap, then a chip; or tap a chip
 * with no gap selected) and the drag flow (drop a chip on a gap or on the
 * bank) go through them — see docs/decisions/0032. That is what keeps the
 * invariant this pool depends on always true: a chip occupies at most one
 * gap, and a gap holds at most one chip.
 */

/** Removes `chipId` from wherever it currently sits (if anywhere) — the
 * "return to bank" half of every move. Private: every exported transition
 * below is expressed in terms of it, so the invariant only needs proving
 * once. */
function withoutChip(placedChip: ReadonlyMap<string, string>, chipId: string): Map<string, string> {
  const next = new Map(placedChip);
  for (const [gapId, placed] of next) {
    if (placed === chipId) {
      next.delete(gapId);
      break; // a chip occupies at most one gap -- nothing more to remove
    }
  }
  return next;
}

/** Drops `chipId` back in the bank (drag-to-bank, or a tap "Clear"). */
export function moveChipToBank(placedChip: ReadonlyMap<string, string>, chipId: string): Map<string, string> {
  return withoutChip(placedChip, chipId);
}

/**
 * Moves `chipId` to `gapId`, vacating both `chipId`'s previous gap (if any)
 * and `gapId`'s previous chip (if any) — the displaced chip returns to the
 * bank rather than being silently dropped, so dragging (or tapping) a new
 * chip onto an already-filled gap reads as a swap, never data loss.
 */
export function moveChipToGap(
  placedChip: ReadonlyMap<string, string>,
  chipId: string,
  gapId: string,
): Map<string, string> {
  const next = withoutChip(placedChip, chipId);
  next.delete(gapId); // vacate whatever chip previously sat at gapId
  next.set(gapId, chipId);
  return next;
}

/** The first gap (in authored `gapIds` order) with no chip placed —
 * "tapping a chip with no gap selected fills the first empty gap". `null`
 * when every gap already holds a chip. */
export function firstEmptyGapId(gapIds: readonly string[], placedChip: ReadonlyMap<string, string>): string | null {
  const filled = new Set(placedChip.keys());
  return gapIds.find((gapId) => !filled.has(gapId)) ?? null;
}

/** Resolves each placed chip id to its display text (`chipTextById`) and
 * builds the same `SlotsResponse` shape `buildSlotsResponse` does for typed
 * input — a gap with no placed chip is simply absent, same "untouched"
 * convention. */
export function buildSlotsResponseFromChips(
  placedChip: ReadonlyMap<string, string>,
  chipTextById: ReadonlyMap<string, string>,
): SlotsResponse {
  return [...placedChip.entries()].map(([gapId, chipId]) => ({ gapId, answer: chipTextById.get(chipId) ?? "" }));
}
