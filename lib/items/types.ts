import { z } from "zod";

/**
 * The item-type contract — see docs/decisions/0006-item-type-contract.md for
 * why the shape is what it is. Every English-course item type (lib/items/*)
 * implements ItemTypeModule against this file; nothing here should need to
 * change to admit a new type (the free_text sketch in __sketches__ is the
 * proof).
 *
 * Per-type payload shapes are deliberately NOT decided here — `payload:
 * unknown` on each item interface is a placeholder each type's own card
 * (ITEM-003..007) narrows. Committing to field shapes this card has no
 * grounds to guess would be exactly the kind of unverified assumption
 * CLAUDE.md asks us not to make.
 */

export const ITEM_TYPE_NAMES = [
  "selection",
  "selection_grid",
  "ordering",
  "matching",
  "slots",
] as const;

export type ItemTypeName = (typeof ITEM_TYPE_NAMES)[number];

interface ItemOf<TType extends string> {
  id: string;
  type: TType;
  /** Narrowed by the owning type's own card; see file header. */
  payload: unknown;
}

export type SelectionItem = ItemOf<"selection">;
export type SelectionGridItem = ItemOf<"selection_grid">;
export type OrderingItem = ItemOf<"ordering">;
export type MatchingItem = ItemOf<"matching">;
export type SlotsItem = ItemOf<"slots">;

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
 * `explanationRef` is a REFERENCE into the item's own authored explanations,
 * not resolved text — resolution is ITEM-009's job, kept separate so this
 * contract does not depend on how explanations end up stored.
 */
export interface SubResult {
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
