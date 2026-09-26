import type { OrderingResponse } from "../items/ordering";

/**
 * PLAY-003 — pure state-transition and response-building helpers behind the
 * `ordering` renderer. Same "extract to lib/ so it's testable without jsdom"
 * precedent as lib/lessonPlayer/selectionResponse.ts (docs/decisions/0024
 * Decision 4, 0029 Decision 3) — this repo's Vitest config has no
 * jsdom/React-rendering setup.
 *
 * `order` is always a permutation of the ids the caller seeded it with
 * (lib/items/shuffle.ts's `shuffleOrderingIndices` output, mapped to element
 * ids via `initialOrder`) — `moveOrderElementToIndex` only ever moves an id
 * already present in `order` to another position already present in `order`,
 * so it can never introduce a duplicate or drop an element. That is what
 * makes ordering's `duplicate_id`/`missing_element` `ItemResponseError`
 * unreachable from a renderer built on top of this, the same
 * "unreachable by construction" discipline selectionResponse.ts documents.
 *
 * `moveOrderElementToIndex` is the SINGLE state-transition function
 * drag-to-reorder (docs/decisions/0032) goes through — the renderer's
 * `onDragEnd` handler never computes a new ordering itself, it calls into
 * here. The up/down move buttons this function originally also served
 * (`moveOrderElement`, a thin "move by one position" wrapper) were removed
 * by docs/decisions/0054 (PLAY-009): the grip handle is now the only pointer
 * control, so the wrapper had no caller left and was deleted with it.
 */

/** Maps `shuffleOrderingIndices`' index permutation to the element ids at
 * those indices — the initial (shuffled) display order, by id. */
export function initialOrder(elementIds: readonly string[], displayIndices: readonly number[]): string[] {
  return displayIndices.map((index) => elementIds[index]);
}

/**
 * Moves the element with `id` to `toIndex`, shifting the elements between its
 * old and new position by one. `toIndex` is clamped to `[0, order.length-1]`
 * so a drag-drop target past either end of the list is a no-op, not an
 * out-of-range write. An `id` not present in `order` is a no-op (mirrors
 * `moveOrderElement`'s existing "unknown id" behaviour) — this is what a drag
 * event firing after the underlying list has already changed (a stale
 * `active.id`) degrades to, rather than throwing.
 */
export function moveOrderElementToIndex(order: readonly string[], id: string, toIndex: number): string[] {
  const fromIndex = order.indexOf(id);
  if (fromIndex === -1) return [...order];
  const clampedIndex = Math.max(0, Math.min(toIndex, order.length - 1));
  if (clampedIndex === fromIndex) return [...order];
  const next = [...order];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(clampedIndex, 0, moved);
  return next;
}

export function buildOrderingResponse(order: readonly string[]): OrderingResponse {
  return { order: [...order] };
}
