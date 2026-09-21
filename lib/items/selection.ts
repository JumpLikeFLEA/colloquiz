import { ItemEnvelopeSchema, type ItemTypeModule, type SelectionItem } from "./types";

/**
 * PLACEHOLDER — scaffolding for the registry (ITEM-001) only. Replaced
 * entirely by ITEM-003, which owns the real payload shape, parse and score
 * for selection (MCQ single, MCQ multi, True/False).
 */
export const selectionModule: ItemTypeModule<SelectionItem> = {
  parse(input) {
    const parsed = ItemEnvelopeSchema.safeParse(input);
    if (!parsed.success || parsed.data.type !== "selection") {
      return { ok: false, errors: [{ field: "type", message: "not a selection item" }] };
    }
    return {
      ok: false,
      errors: [{ field: "(item)", message: "selection parsing not yet implemented — see ITEM-003" }],
    };
  },
  score(_item, _response) {
    return { earned: 0, possible: 1, subResults: [] };
  },
  rendererNeeds: { inputs: ["choice"] },
};
