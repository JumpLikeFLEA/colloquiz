import type { SelectionItem } from "../items";
import type { SelectionResponse } from "../items/selection";
import type { SelectionGridResponse } from "../items/selectionGrid";

/**
 * PLAY-002 — pure state-transition and response-building helpers behind the
 * `selection`/`selection_grid` renderers. Extracted from the React
 * components (app/components/lesson-player/practice/) so the "drives the
 * renderer to submission and scores the result" acceptance line is
 * satisfiable as a `lib/` unit test — this repo's Vitest config has no
 * jsdom/React-rendering setup (docs/decisions/0024 Decision 4), and adding
 * one is a new dependency, a stop-and-ask even under `--no-approval`.
 *
 * Both toggle functions only ever add/remove ids the caller already knows
 * about (an option id read off `item.payload.options`, a row id off
 * `item.payload.rows`) — never an id typed or guessed — which is what makes
 * `unknown_id`/`duplicate_id` `ItemResponseError`s unreachable from a
 * renderer built on top of these: the state they produce is always a subset
 * of the item's own ids, deduplicated by construction (array membership
 * check / Map key).
 */

/**
 * Toggles `optionId` into or out of the current selection.
 * `multi: false` replaces the selection outright (radio semantics); `multi:
 * true` adds/removes the one id (checkbox semantics) — mirroring
 * `SelectionPayload.multi`, the same field `selectionModule.score` branches
 * on for `too_many_selections`.
 */
export function toggleSelectionOption(
  selected: readonly string[],
  optionId: string,
  multi: boolean,
): string[] {
  if (!multi) {
    return selected.length === 1 && selected[0] === optionId ? [] : [optionId];
  }
  return selected.includes(optionId)
    ? selected.filter((id) => id !== optionId)
    : [...selected, optionId];
}

/** Builds the `SelectionResponse` shape `selectionModule.score` accepts. */
export function buildSelectionResponse(selected: readonly string[]): SelectionResponse {
  return { selectedOptionIds: [...selected] };
}

/** Every option's `correct`/`selected` state after submission — the granularity
 * a `selection` renderer marks feedback at, since the item itself has exactly
 * one `SubResult` (docs/decisions/0009) but a learner still needs to see
 * which option(s) they picked and which was the right one. */
export function selectionOptionFeedback(
  item: SelectionItem,
  selected: readonly string[],
): Array<{ id: string; wasSelected: boolean; isCorrect: boolean }> {
  const correct = new Set(item.payload.correctOptionIds);
  return item.payload.options.map((option) => ({
    id: option.id,
    wasSelected: selected.includes(option.id),
    isCorrect: correct.has(option.id),
  }));
}

/** Sets one row's True/False answer, replacing any prior answer for that
 * row. `rowId` always comes from `item.payload.rows`, never typed. */
export function setGridRowAnswer(
  answers: ReadonlyMap<string, boolean>,
  rowId: string,
  answer: boolean,
): Map<string, boolean> {
  const next = new Map(answers);
  next.set(rowId, answer);
  return next;
}

/** Builds the `SelectionGridResponse` shape `selectionGridModule.score`
 * accepts. Rows with no entry in `answers` (not yet tapped) are simply
 * omitted — `readResponse` in selectionGrid.ts treats an absent row as
 * unanswered, not malformed. */
export function buildSelectionGridResponse(answers: ReadonlyMap<string, boolean>): SelectionGridResponse {
  return [...answers.entries()].map(([rowId, answer]) => ({ rowId, answer }));
}
