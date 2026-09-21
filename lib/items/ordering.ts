import { ItemEnvelopeSchema, type ItemTypeModule, type OrderingItem } from "./types";

/**
 * PLACEHOLDER — scaffolding for the registry (ITEM-001) only. Replaced
 * entirely by ITEM-005, which owns the real payload shape, parse and score
 * for ordering (permutation of N elements).
 */
export const orderingModule: ItemTypeModule<OrderingItem> = {
  parse(input) {
    const parsed = ItemEnvelopeSchema.safeParse(input);
    if (!parsed.success || parsed.data.type !== "ordering") {
      return { ok: false, errors: [{ field: "type", message: "not an ordering item" }] };
    }
    return {
      ok: false,
      errors: [{ field: "(item)", message: "ordering parsing not yet implemented — see ITEM-005" }],
    };
  },
  score(_item, _response) {
    return { earned: 0, possible: 1, subResults: [] };
  },
  rendererNeeds: { inputs: ["drag", "typed"] },
};
