import type { Item } from "../items";
import type { LessonPracticeBlock } from "../lessons";

/**
 * AUTH-016 (docs/decisions/0125 Decisions 5 and 6): the Exercise group of the
 * lesson editor's "Add block" menu. Each entry is named for what the author
 * wants to make, not for the engine type behind it, and starts EMPTY: a new
 * exercise fails `parseItem` until the author fills it in, so Save refuses it
 * with the errors in place. No placeholder text, because placeholder text can
 * be published.
 *
 * The only prefilled content is True / False's two options: they are the
 * exercise, not a placeholder for one.
 */

export const EXERCISE_VARIANTS = [
  "multiple_choice",
  "true_false",
  "true_false_statements",
  "put_in_order",
  "match_pairs",
  "sort_into_groups",
  "fill_the_gaps",
  "drag_words_into_gaps",
] as const;

export type ExerciseVariant = (typeof EXERCISE_VARIANTS)[number];

export const EXERCISE_VARIANT_LABEL: Record<ExerciseVariant, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  true_false_statements: "True/False statements",
  put_in_order: "Put in order",
  match_pairs: "Match pairs",
  sort_into_groups: "Sort into groups",
  fill_the_gaps: "Fill the gaps",
  drag_words_into_gaps: "Drag words into gaps",
};

export const TRUE_FALSE_OPTION_TEXTS = ["True", "False"] as const;

type NewId = () => string;

const defaultNewId: NewId = () => crypto.randomUUID();

function emptyItem(variant: ExerciseVariant, id: string, newId: NewId): Item {
  switch (variant) {
    case "multiple_choice":
    case "true_false":
      return {
        id,
        type: "selection",
        payload: {
          prompt: "",
          multi: false,
          options:
            variant === "true_false"
              ? TRUE_FALSE_OPTION_TEXTS.map((text) => ({ id: newId(), text }))
              : [
                  { id: newId(), text: "" },
                  { id: newId(), text: "" },
                ],
          correctOptionIds: [],
          // The selection form keys its one explanation by explanationRef;
          // the item's own id is as good a key as any and is never shown.
          explanationRef: id,
          explanations: {},
        },
      };
    case "true_false_statements": {
      const rowId = newId();
      return {
        id,
        type: "selection_grid",
        payload: {
          prompt: "",
          rows: [{ id: rowId, statement: "", correct: true, explanationRef: rowId }],
          explanations: {},
        },
      };
    }
    case "put_in_order": {
      const [a, b] = [newId(), newId()];
      return {
        id,
        type: "ordering",
        payload: {
          prompt: "",
          elements: [
            { id: a, text: "", explanationRef: a },
            { id: b, text: "", explanationRef: b },
          ],
          explanations: {},
        },
      };
    }
    case "match_pairs":
    case "sort_into_groups": {
      // Two of each, paired 1–1: "sort" needs at least two groups to parse,
      // and two pairs is the smallest matching that isn't trivially solved.
      const [l1, l2, r1, r2, p1, p2] = [newId(), newId(), newId(), newId(), newId(), newId()];
      return {
        id,
        type: "matching",
        payload: {
          prompt: "",
          left: [
            { id: l1, content: { kind: "text", text: "" } },
            { id: l2, content: { kind: "text", text: "" } },
          ],
          right: [
            { id: r1, content: { kind: "text", text: "" } },
            { id: r2, content: { kind: "text", text: "" } },
          ],
          pairs: [
            { id: p1, left: l1, right: r1, explanationRef: p1 },
            { id: p2, left: l2, right: r2, explanationRef: p2 },
          ],
          explanations: {},
          presentation: variant === "sort_into_groups" ? "sort" : "pairs",
        },
      };
    }
    case "fill_the_gaps":
    case "drag_words_into_gaps": {
      const gapId = newId();
      return {
        id,
        type: "slots",
        payload: {
          prompt: "",
          input: variant === "drag_words_into_gaps" ? "drag" : "typed",
          gaps: [{ id: gapId, acceptedAnswers: [""], explanationRef: gapId }],
          explanations: {},
        },
      };
    }
  }
}

/** A new, empty practice block for `variant`. Fails `parseItem` until filled. */
export function exerciseTemplate(variant: ExerciseVariant, newId: NewId = defaultNewId): LessonPracticeBlock {
  const id = newId();
  return { id, kind: "practice", item: emptyItem(variant, id, newId) };
}

/**
 * The friendly label for an existing exercise, read from its content, so an
 * imported item gets the same label as one added from the menu. A selection
 * reads as "True / False" only while its options are exactly True and False;
 * once the author edits them it is multiple choice, which is what it then is.
 */
export function exerciseLabel(item: Item): string {
  switch (item.type) {
    case "selection": {
      const texts = item.payload.options.map((o) => o.text);
      const isTrueFalse =
        !item.payload.multi &&
        texts.length === TRUE_FALSE_OPTION_TEXTS.length &&
        texts.every((t, i) => t === TRUE_FALSE_OPTION_TEXTS[i]);
      return EXERCISE_VARIANT_LABEL[isTrueFalse ? "true_false" : "multiple_choice"];
    }
    case "selection_grid":
      return EXERCISE_VARIANT_LABEL.true_false_statements;
    case "ordering":
      return EXERCISE_VARIANT_LABEL.put_in_order;
    case "matching":
      return EXERCISE_VARIANT_LABEL[item.payload.presentation === "sort" ? "sort_into_groups" : "match_pairs"];
    case "slots":
      return EXERCISE_VARIANT_LABEL[item.payload.input === "drag" ? "drag_words_into_gaps" : "fill_the_gaps"];
  }
}
