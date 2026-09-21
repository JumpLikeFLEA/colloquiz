import type { ItemTypeName } from "./types";

/**
 * Codes shared across every type that throws `ItemResponseError`, plus each
 * type's own type-specific extension. See docs/decisions/0012 §"Evidence b"
 * for why these three unify (same meaning across selection/selection_grid/
 * ordering) and why `too_many_selections` / `missing_element` do not.
 */
export type SharedItemResponseErrorCode =
  /** Not the response shape at all — a client serialization bug. */
  | "malformed"
  /** Names an id (option/row/element/...) the item does not have. */
  | "unknown_id"
  /** The same id appears twice where the item's shape forbids it. */
  | "duplicate_id";

export type ItemResponseErrorCode =
  | SharedItemResponseErrorCode
  /** selection only: more than one selection on a single-answer item. */
  | "too_many_selections"
  /** ordering only: response omits an element id the item has. */
  | "missing_element";

/**
 * Thrown by a type module's `score` for a response that no learner could
 * have produced — decided in docs/decisions/0012-item-response-errors.md
 * (option 1): one shared class, parameterized by `itemType`, replacing the
 * three module-scoped `Error` subclasses `selection`/`selection_grid`/
 * `ordering` each used to define. `score`'s signature is unchanged; only the
 * thrown value's class is shared.
 *
 * A thrown `ItemResponseError` is distinguishable from a real (possibly
 * zero) score by construction — see docs/decisions/0008 §3 — so callers tell
 * "client bug" from "legitimate zero score" with one `instanceof` check
 * instead of one per type.
 */
export class ItemResponseError extends Error {
  readonly code: ItemResponseErrorCode;
  readonly itemId: string;
  readonly itemType: ItemTypeName;

  constructor(code: ItemResponseErrorCode, itemId: string, itemType: ItemTypeName, message: string) {
    super(message);
    this.name = "ItemResponseError";
    this.code = code;
    this.itemId = itemId;
    this.itemType = itemType;
  }
}
