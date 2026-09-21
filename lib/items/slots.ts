import { ItemEnvelopeSchema, type ItemTypeModule, type SlotsItem } from "./types";

/**
 * PLACEHOLDER — scaffolding for the registry (ITEM-001) only. Replaced
 * entirely by ITEM-007, which owns the real payload shape, parse and score
 * for slots (cloze, word insertion; input: 'typed' | 'drag').
 */
export const slotsModule: ItemTypeModule<SlotsItem> = {
  parse(input) {
    const parsed = ItemEnvelopeSchema.safeParse(input);
    if (!parsed.success || parsed.data.type !== "slots") {
      return { ok: false, errors: [{ field: "type", message: "not a slots item" }] };
    }
    return {
      ok: false,
      errors: [{ field: "(item)", message: "slots parsing not yet implemented — see ITEM-007" }],
    };
  },
  score(_item, _response) {
    return { earned: 0, possible: 1, subResults: [] };
  },
  rendererNeeds: { inputs: ["typed", "drag"] },
};
