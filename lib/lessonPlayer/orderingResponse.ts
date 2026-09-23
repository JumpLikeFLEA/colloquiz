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
 * ids via `initialOrder`) — `moveOrderElementToIndex` (and `moveOrderElement`,
 * which delegates to it) only ever moves an id already present in `order` to
 * another position already present in `order`, so it can never introduce a
 * duplicate or drop an element. That is what makes ordering's
 * `duplicate_id`/`missing_element` `ItemResponseError` unreachable from a
 * renderer built on top of this, the same "unreachable by construction"
 * discipline selectionResponse.ts documents.
 *
 * `moveOrderElementToIndex` is the SINGLE state-transition function both the
 * up/down buttons and drag-to-reorder (docs/decisions/0032) go through —
 * `moveOrderElement` is a thin "move by one position" wrapper over it, kept
 * only because the buttons express a direction, not a target index. Neither
 * the button click handler nor the drag `onDragEnd` handler computes a new
 * ordering itself; both call into here.
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

export function moveOrderElement(order: readonly string[], id: string, direction: "up" | "down"): string[] {
  const index = order.indexOf(id);
  if (index === -1) return [...order];
  const target = direction === "up" ? index - 1 : index + 1;
  return moveOrderElementToIndex(order, id, target);
}

export function buildOrderingResponse(order: readonly string[]): OrderingResponse {
  return { order: [...order] };
}
