import { describe, expect, it } from "vitest";
import { parseItem, type Item } from "../items";
import { parseLessonDocument, serializeLessonDocument } from "../lessons";
import {
  EXERCISE_VARIANT_LABEL,
  EXERCISE_VARIANTS,
  exerciseLabel,
  exerciseTemplate,
  type ExerciseVariant,
} from "./exerciseTemplates";

// AUTH-016 acceptance: "every empty template fails parseItem at the fields the
// form flags, and each template filled with minimal real content parses."
//
// "The fields the form flags" is the exact set of error paths each form in
// PracticeItemForm.tsx renders an errorList for. Each expected list below is
// that set for the template's shape; PracticeItemForm.test.tsx renders every
// one of these messages in place.

function counter() {
  let n = 0;
  return () => `id${++n}`;
}

function errorFields(item: Item): string[] {
  const result = parseItem(item);
  expect(result.ok).toBe(false);
  if (result.ok) return [];
  return [...new Set(result.errors.map((e) => e.field))].sort();
}

const EXPECTED_EMPTY_FIELDS: Record<ExerciseVariant, string[]> = {
  multiple_choice: [
    "payload.correctOptionIds",
    "payload.explanations",
    "payload.options",
    "payload.options[0].text",
    "payload.options[1].text",
    "payload.prompt",
  ],
  true_false: ["payload.correctOptionIds", "payload.explanations", "payload.prompt"],
  true_false_statements: ["payload.explanations", "payload.prompt", "payload.rows[0].statement"],
  put_in_order: [
    "payload.elements[0].text",
    "payload.elements[1].text",
    "payload.explanations",
    "payload.prompt",
  ],
  match_pairs: [
    "payload.explanations",
    "payload.left[0].content.text",
    "payload.left[1].content.text",
    "payload.prompt",
    "payload.right[0].content.text",
    "payload.right[1].content.text",
  ],
  sort_into_groups: [
    "payload.explanations",
    "payload.left[0].content.text",
    "payload.left[1].content.text",
    "payload.prompt",
    "payload.right[0].content.text",
    "payload.right[1].content.text",
  ],
  fill_the_gaps: ["payload.explanations", "payload.gaps[0].acceptedAnswers[0]", "payload.prompt"],
  drag_words_into_gaps: ["payload.explanations", "payload.gaps[0].acceptedAnswers[0]", "payload.prompt"],
};

/** The smallest real content an author could type into each template. */
function fill(item: Item): Item {
  const fallbackExplanation = "Look at the rule above.";
  switch (item.type) {
    case "selection": {
      const options =
        item.payload.options[0].text === "True"
          ? item.payload.options
          : item.payload.options.map((o, i) => ({ ...o, text: ["went", "goed"][i] }));
      return {
        ...item,
        payload: {
          ...item.payload,
          prompt: "Yesterday I ___ home.",
          options,
          correctOptionIds: [options[0].id],
          fallbackExplanation,
        },
      };
    }
    case "selection_grid":
      return {
        ...item,
        payload: {
          ...item.payload,
          prompt: "True or false?",
          rows: item.payload.rows.map((r) => ({ ...r, statement: "London is in England." })),
          fallbackExplanation,
        },
      };
    case "ordering":
      return {
        ...item,
        payload: {
          ...item.payload,
          prompt: "Put the words in order.",
          elements: item.payload.elements.map((e, i) => ({ ...e, text: ["I", "agree"][i] })),
          fallbackExplanation,
        },
      };
    case "matching":
      return {
        ...item,
        payload: {
          ...item.payload,
          prompt: "Match.",
          left: item.payload.left.map((e, i) => ({ ...e, content: { kind: "text", text: ["cat", "dog"][i] } })),
          right: item.payload.right.map((e, i) => ({ ...e, content: { kind: "text", text: ["кот", "собака"][i] } })),
          fallbackExplanation,
        },
      };
    case "slots":
      return {
        ...item,
        payload: {
          ...item.payload,
          prompt: "I ___ tea.",
          gaps: item.payload.gaps.map((g) => ({ ...g, acceptedAnswers: ["like"] })),
          fallbackExplanation,
        },
      };
  }
}

describe("exerciseTemplate", () => {
  it.each(EXERCISE_VARIANTS)("%s: the empty template fails parseItem at the fields the form flags", (variant) => {
    const block = exerciseTemplate(variant, counter());
    expect(errorFields(block.item)).toEqual(EXPECTED_EMPTY_FIELDS[variant]);
  });

  it.each(EXERCISE_VARIANTS)("%s: filled with minimal real content, it parses", (variant) => {
    const filled = fill(exerciseTemplate(variant, counter()).item);
    const result = parseItem(filled);
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it.each(EXERCISE_VARIANTS)("%s: a filled block round-trips through the lesson document validator", (variant) => {
    const block = exerciseTemplate(variant, counter());
    const result = parseLessonDocument(serializeLessonDocument([{ ...block, item: fill(block.item) }]));
    expect(result.ok).toBe(true);
  });

  it("the block id and the item id are the same, as parseLessonDocument requires", () => {
    const block = exerciseTemplate("multiple_choice", counter());
    expect(block.id).toBe(block.item.id);
  });

  it("every id inside a template is distinct", () => {
    for (const variant of EXERCISE_VARIANTS) {
      const ids: string[] = [];
      const newId = () => {
        const id = crypto.randomUUID();
        ids.push(id);
        return id;
      };
      exerciseTemplate(variant, newId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("True / False starts with its two options and no correct answer chosen", () => {
    const { item } = exerciseTemplate("true_false", counter());
    if (item.type !== "selection") throw new Error("expected selection");
    expect(item.payload.options.map((o) => o.text)).toEqual(["True", "False"]);
    expect(item.payload.correctOptionIds).toEqual([]);
    expect(item.payload.multi).toBe(false);
  });

  it("maps each variant to its engine type and presentation", () => {
    const shape = (v: ExerciseVariant) => {
      const { item } = exerciseTemplate(v, counter());
      if (item.type === "matching") return `${item.type}:${item.payload.presentation}`;
      if (item.type === "slots") return `${item.type}:${item.payload.input}`;
      return item.type;
    };
    expect(EXERCISE_VARIANTS.map(shape)).toEqual([
      "selection",
      "selection",
      "selection_grid",
      "ordering",
      "matching:pairs",
      "matching:sort",
      "slots:typed",
      "slots:drag",
    ]);
  });
});

describe("exerciseLabel", () => {
  it.each(EXERCISE_VARIANTS)("%s: a new template carries its menu label", (variant) => {
    expect(exerciseLabel(exerciseTemplate(variant, counter()).item)).toBe(EXERCISE_VARIANT_LABEL[variant]);
  });

  it("a True / False item whose options were edited reads as multiple choice", () => {
    const { item } = exerciseTemplate("true_false", counter());
    if (item.type !== "selection") throw new Error("expected selection");
    const edited: Item = {
      ...item,
      payload: { ...item.payload, options: item.payload.options.map((o, i) => (i === 1 ? { ...o, text: "Not given" } : o)) },
    };
    expect(exerciseLabel(edited)).toBe("Multiple choice");
  });

  it("a multi-answer selection with True/False options is multiple choice", () => {
    const { item } = exerciseTemplate("true_false", counter());
    if (item.type !== "selection") throw new Error("expected selection");
    expect(exerciseLabel({ ...item, payload: { ...item.payload, multi: true } })).toBe("Multiple choice");
  });
});
