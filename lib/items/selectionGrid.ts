import { ItemEnvelopeSchema, type ItemTypeModule, type SelectionGridItem } from "./types";

/**
 * PLACEHOLDER — scaffolding for the registry (ITEM-001) only. Replaced
 * entirely by ITEM-004, which owns the real payload shape, parse and score
 * for selection_grid (inline True/False over N statements).
 */
export const selectionGridModule: ItemTypeModule<SelectionGridItem> = {
  parse(input) {
    const parsed = ItemEnvelopeSchema.safeParse(input);
    if (!parsed.success || parsed.data.type !== "selection_grid") {
      return { ok: false, errors: [{ field: "type", message: "not a selection_grid item" }] };
    }
    return {
      ok: false,
      errors: [
        { field: "(item)", message: "selection_grid parsing not yet implemented — see ITEM-004" },
      ],
    };
  },
  score(_item, _response) {
    return { earned: 0, possible: 1, subResults: [] };
  },
  rendererNeeds: { inputs: ["choice"] },
};
