import { matchingModule } from "./matching";
import { orderingModule } from "./ordering";
import { selectionModule } from "./selection";
import { selectionGridModule } from "./selectionGrid";
import { slotsModule } from "./slots";
import type { Item, ItemScoreResult, ItemTypeRegistry, ParseResult } from "./types";

/**
 * The registry map. Typed against ItemTypeRegistry (a mapped type over every
 * ItemTypeName), so removing a key here — or adding one that isn't in
 * ITEM_TYPE_NAMES — is a `tsc` error, not a runtime "unknown item type".
 */
export const itemTypeRegistry: ItemTypeRegistry = {
  selection: selectionModule,
  selection_grid: selectionGridModule,
  ordering: orderingModule,
  matching: matchingModule,
  slots: slotsModule,
};

/** Routes raw authored JSON to its type module's `parse` by its `type` field. */
export function parseItem(input: unknown): ParseResult<Item> {
  if (typeof input !== "object" || input === null || !("type" in input)) {
    return { ok: false, errors: [{ field: "type", message: "missing item type" }] };
  }
  const type = (input as { type: unknown }).type;
  if (typeof type !== "string" || !(type in itemTypeRegistry)) {
    return { ok: false, errors: [{ field: "type", message: `unknown item type "${String(type)}"` }] };
  }
  const typeModule = itemTypeRegistry[type as keyof ItemTypeRegistry];
  return typeModule.parse(input) as ParseResult<Item>;
}

/** Routes a parsed item + its response to its type module's `score`. */
export function scoreItem(item: Item, response: unknown): ItemScoreResult {
  const typeModule = itemTypeRegistry[item.type];
  return typeModule.score(item as never, response);
}

export * from "./types";
