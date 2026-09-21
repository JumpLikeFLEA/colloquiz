import { z } from "zod";
import type { ItemTypeModule, ParseResult } from "../types";

/**
 * THE ABSTRACTION TEST (ITEM-001 acceptance) — a throwaway sixth item type,
 * deferred in docs/handoff.md until LLM grading exists. It compiles against
 * ItemTypeModule with ZERO changes to types.ts or index.ts: it is not
 * ITEM_TYPE_NAMES, not in the registry, and Item does not include it — this
 * file exists only to prove the contract admits a type it was never told
 * about. If free_text is ever built for real, this sketch is deleted and
 * replaced by its own card, the same way selection.ts etc. will replace
 * their own placeholders.
 */

interface FreeTextItem {
  id: string;
  type: "free_text";
  payload: unknown;
}

const FreeTextEnvelopeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("free_text"),
  payload: z.unknown(),
});

export const freeTextSketchModule: ItemTypeModule<FreeTextItem, string> = {
  parse(input): ParseResult<FreeTextItem> {
    const parsed = FreeTextEnvelopeSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, errors: [{ field: "type", message: "not a free_text item" }] };
    }
    return { ok: true, item: parsed.data };
  },
  // Always earns nothing, pending LLM grading — see docs/handoff.md, "free_text".
  score(_item, _response) {
    return { earned: 0, possible: 1, subResults: [] };
  },
  rendererNeeds: { inputs: ["typed"] },
};
