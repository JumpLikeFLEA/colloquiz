import { ItemEnvelopeSchema, type ItemTypeModule, type MatchingItem } from "./types";

/**
 * PLACEHOLDER — scaffolding for the registry (ITEM-001) only. Replaced
 * entirely by ITEM-006, which owns the real payload shape, parse and score
 * for matching (pairs, including image matching — same type, image renderer).
 */
export const matchingModule: ItemTypeModule<MatchingItem> = {
  parse(input) {
    const parsed = ItemEnvelopeSchema.safeParse(input);
    if (!parsed.success || parsed.data.type !== "matching") {
      return { ok: false, errors: [{ field: "type", message: "not a matching item" }] };
    }
    return {
      ok: false,
      errors: [{ field: "(item)", message: "matching parsing not yet implemented — see ITEM-006" }],
    };
  },
  score(_item, _response) {
    return { earned: 0, possible: 1, subResults: [] };
  },
  rendererNeeds: { inputs: ["drag"] },
};
