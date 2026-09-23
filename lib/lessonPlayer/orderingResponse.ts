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
 * ids via `initialOrder`) — `moveOrderElement` only ever swaps two ids
 * already present in `order`, so it can never introduce a duplicate or drop
 * an element. That is what makes ordering's `duplicate_id`/`missing_element`
 * `ItemResponseError` unreachable from a renderer built on top of this, the
 * same "unreachable by construction" discipline selectionResponse.ts
 * documents.
 */

/** Maps `shuffleOrderingIndices`' index permutation to the element ids at
 * those indices — the initial (shuffled) display order, by id. */
export function initialOrder(elementIds: readonly string[], displayIndices: readonly number[]): string[] {
  return displayIndices.map((index) => elementIds[index]);
}

export function moveOrderElement(order: readonly string[], id: string, direction: "up" | "down"): string[] {
  const index = order.indexOf(id);
  if (index === -1) return [...order];
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= order.length) return [...order];
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function buildOrderingResponse(order: readonly string[]): OrderingResponse {
  return { order: [...order] };
}
