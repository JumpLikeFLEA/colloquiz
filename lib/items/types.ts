import { z } from "zod";
import type { MatchingPayload } from "./matching";
import type { OrderingPayload } from "./ordering";
import type { SelectionPayload } from "./selection";
import type { SelectionGridPayload } from "./selectionGrid";
import type { SlotsPayload } from "./slots";

/**
 * The item-type contract — see docs/decisions/0006-item-type-contract.md for
 * why the shape is what it is. Every English-course item type (lib/items/*)
 * implements ItemTypeModule against this file; nothing here should need to
 * change to admit a new type (the free_text sketch in __sketches__ is the
 * proof).
 *
 * Per-type payload shapes are NOT decided here — `payload: unknown` on each
 * item interface is a placeholder each type's own card (ITEM-003..007)
 * narrows, as `selection` now has (ITEM-003). Committing to field shapes a
 * card has no grounds to guess would be exactly the kind of unverified
 * assumption CLAUDE.md asks us not to make.
 *
 * A narrowed type imports its payload back from its own module. That import is
 * type-only and erases at compile time, so `types.ts` ↔ `selection.ts` is a
 * cycle in the type graph only, never at runtime: `selection.ts` imports
 * `ItemEnvelopeSchema` (a value) from here, and nothing flows back the other
 * way once the types are stripped.
 */

export const ITEM_TYPE_NAMES = [
  "selection",
  "selection_grid",
  "ordering",
  "matching",
  "slots",
] as const;

export type ItemTypeName = (typeof ITEM_TYPE_NAMES)[number];

interface ItemOf<TType extends string, TPayload = unknown> {
  id: string;
  type: TType;
  /** `unknown` until the owning type's own card narrows it; see file header. */
  payload: TPayload;
}

export type SelectionItem = ItemOf<"selection", SelectionPayload>;
export type SelectionGridItem = ItemOf<"selection_grid", SelectionGridPayload>;
export type OrderingItem = ItemOf<"ordering", OrderingPayload>;
export type MatchingItem = ItemOf<"matching", MatchingPayload>;
export type SlotsItem = ItemOf<"slots", SlotsPayload>;

export type Item =
  | SelectionItem
  | SelectionGridItem
  | OrderingItem
  | MatchingItem
  | SlotsItem;

/** Minimal envelope every authored item satisfies, regardless of type — id +
 * discriminant. Each type module's own `parse` narrows `payload` further. */
export const ItemEnvelopeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(ITEM_TYPE_NAMES),
  payload: z.unknown(),
});

export type ParseError = { field: string; message: string };

export type ParseResult<TItem> =
  | { ok: true; item: TItem }
  | { ok: false; errors: ParseError[] };

/**
 * One scored sub-part of an item (a row of a selection_grid, a pair of a
 * matching item, a gap of a slots item, ...). `correct` is kept alongside
 * `earned`/`possible` rather than derived, because a sub-result can be
 * partially credited (see ItemScoreResult) without being "correct" in the
 * pass/fail sense the UI still needs for a per-row check/cross.
 *
 * `id` identifies WHICH sub-part this is — a row id, a pair id, a gap id —
 * so a renderer or a review UI can put a check/cross next to the right part
 * of the item without relying on array order. For a type with exactly one
 * sub-part (`selection`), `id` is the item's own id: see
 * docs/decisions/0009-subresult-identity.md.
 *
 * `explanationRef` is a REFERENCE into the item's own authored explanations,
 * not resolved text — `lib/items/explanations.ts` (ITEM-009) resolves it,
 * kept separate so this contract does not depend on how explanations end up
 * stored.
 */
export interface SubResult {
  id: string;
  correct: boolean;
  earned: number;
  possible: number;
  explanationRef: string;
}

/**
 * An item's score. `earned`/`possible` are the sums of subResults' own
 * earned/possible — a single-part item (e.g. one MCQ) has exactly one
 * subResult. Partial credit lives PER subResult, never as a single
 * all-or-nothing boolean: see docs/decisions/0006-item-type-contract.md.
 */
export interface ItemScoreResult {
  earned: number;
  possible: number;
  subResults: SubResult[];
}

/**
 * What a type declares its renderer needs — descriptive metadata only. No
 * rendering code belongs in this card or in any lib/items/* module; the
 * renderer itself is built elsewhere and reads this to decide which
 * component to mount.
 */
export interface RendererNeeds {
  /** Input affordance(s) this type's renderer must support. */
  inputs: readonly string[];
}

/**
 * The contract every item type implements. `TResponse` is left to the type
 * (a selection response looks nothing like an ordering response); the
 * registry is keyed by `TItem["type"]`, not by response shape.
 *
 * Constrained to the minimal `{ id, type }` shape, NOT to `Item` — a module
 * for a type outside the five in ITEM_TYPE_NAMES (see the free_text sketch
 * in __sketches__) still satisfies this contract. Item is what the real
 * registry is keyed over; this interface is what any type, registered or
 * not, implements against.
 */
export interface ItemTypeModule<
  TItem extends { id: string; type: string } = Item,
  TResponse = unknown,
> {
  parse(input: unknown): ParseResult<TItem>;
  score(item: TItem, response: TResponse): ItemScoreResult;
  rendererNeeds: RendererNeeds;
}

/**
 * The registry every type module is entered into. A mapped type over
 * ITEM_TYPE_NAMES rather than a plain Record<string, ...>: omitting a type
 * or adding one that doesn't extend ItemTypeName is a compile error, not a
 * registry that silently answers "unknown type" at runtime.
 */
export type ItemTypeRegistry = {
  [K in ItemTypeName]: ItemTypeModule<Extract<Item, { type: K }>>;
};
