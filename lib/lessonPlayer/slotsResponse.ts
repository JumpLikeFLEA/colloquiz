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

// --- drag input ---------------------------------------------------------

/**
 * `placedChip` maps gap id -> chip id (one chip per gap, keyed by the
 * originating gap's own id — see SlotsRenderer). A chip already placed at
 * one gap is never offered for another (the renderer's pool filters on
 * `placedChip`'s values), so `placeChip` never needs to look for and remove
 * a chip's prior placement itself — the same "consumable, not reusable"
 * pool discipline `matchingResponse.ts` deliberately does NOT use (0013
 * makes matching many-to-one; a slots gap/chip pairing is 1:1, one blank per
 * word).
 */
export function placeChip(placedChip: ReadonlyMap<string, string>, gapId: string, chipId: string): Map<string, string> {
  const next = new Map(placedChip);
  next.set(gapId, chipId);
  return next;
}

export function clearChip(placedChip: ReadonlyMap<string, string>, gapId: string): Map<string, string> {
  const next = new Map(placedChip);
  next.delete(gapId);
  return next;
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
