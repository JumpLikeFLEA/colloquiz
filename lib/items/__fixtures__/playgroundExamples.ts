/**
 * ITEM-010 — one authored example per item type, raw (pre-`parseItem`) JSON.
 *
 * These are the fixtures the dev-only item playground renders
 * (app/(main)/app/admin/item-playground) to prove the five type modules
 * end-to-end. Per this card's acceptance ("committed as fixtures and reused
 * by the M2 player's tests rather than re-authored"), the real lesson player
 * built in M2 imports this array instead of authoring its own throwaway
 * content — do not fork a second copy for that.
 *
 * Each entry is the raw envelope a type's own `parse` accepts, not a
 * pre-parsed `Item` — the same "fixtures are built THROUGH parse, never
 * hand-constructed" convention every type's own test file already follows
 * (see e.g. lib/items/selection.test.ts).
 */

export interface PlaygroundExample {
  /** Human label for the playground UI — not part of the authored envelope. */
  label: string;
  /** Raw authored JSON, as `parseItem` (lib/items/index.ts) expects it. */
  raw: unknown;
}

export const PLAYGROUND_EXAMPLES: readonly PlaygroundExample[] = [
  {
    label: "selection — MCQ single",
    raw: {
      id: "playground-selection",
      type: "selection",
      payload: {
        prompt: "Which sentence is correct?",
        multi: false,
        options: [
          { id: "a", text: "She go to school every day." },
          { id: "b", text: "She goes to school every day." },
          { id: "c", text: "She going to school every day." },
          { id: "d", text: "She gone to school every day." },
        ],
        correctOptionIds: ["b"],
        explanationRef: "why-b",
        explanations: {
          "why-b": "Third person singular present tense takes an -s ending: she goes.",
        },
        fallbackExplanation: "Only one option uses the correct present-tense verb form.",
      },
    },
  },
  {
    label: "selection_grid — inline True/False",
    raw: {
      id: "playground-selection-grid",
      type: "selection_grid",
      payload: {
        prompt: "True or False?",
        rows: [
          {
            id: "row-1",
            statement: '"I have been to Paris" uses the present perfect tense.',
            correct: true,
            explanationRef: "row-1-exp",
          },
          {
            id: "row-2",
            statement: '"I go to Paris yesterday" is grammatically correct.',
            correct: false,
            explanationRef: "row-2-exp",
          },
          {
            id: "row-3",
            statement: '"Yesterday" is usually paired with the simple past.',
            correct: true,
            explanationRef: "row-3-exp",
          },
        ],
        explanations: {
          "row-1-exp": '"have been" is the present perfect of "to be."',
          "row-2-exp": '"Yesterday" needs the simple past: "I went to Paris yesterday."',
          "row-3-exp": "A specific past time marker like \"yesterday\" pairs with the simple past.",
        },
      },
    },
  },
  {
    label: "ordering — word order",
    raw: {
      id: "playground-ordering",
      type: "ordering",
      payload: {
        prompt: "Put the words in the correct order.",
        elements: [
          { id: "w1", text: "she", explanationRef: "w1-exp" },
          { id: "w2", text: "always", explanationRef: "w2-exp" },
          { id: "w3", text: "arrives", explanationRef: "w3-exp" },
          { id: "w4", text: "early", explanationRef: "w4-exp" },
        ],
        explanations: {
          "w1-exp": "The subject comes first: \"she.\"",
          "w2-exp": "Adverbs of frequency (\"always\") go before the main verb.",
          "w3-exp": "The verb follows the frequency adverb: \"always arrives.\"",
          "w4-exp": "The manner adverb (\"early\") closes the sentence.",
        },
      },
    },
  },
  {
    label: "matching — word to definition",
    raw: {
      id: "playground-matching",
      type: "matching",
      payload: {
        prompt: "Match each word to its definition.",
        left: [
          { id: "l1", content: { kind: "text", text: "ubiquitous" } },
          { id: "l2", content: { kind: "text", text: "meticulous" } },
          { id: "l3", content: { kind: "text", text: "reluctant" } },
        ],
        right: [
          { id: "r1", content: { kind: "text", text: "unwilling to do something" } },
          { id: "r2", content: { kind: "text", text: "present everywhere" } },
          { id: "r3", content: { kind: "text", text: "very careful and precise" } },
          { id: "r4", content: { kind: "text", text: "distractor: not used by any pair" } },
        ],
        pairs: [
          { id: "p1", left: "l1", right: "r2", explanationRef: "p1-exp" },
          { id: "p2", left: "l2", right: "r3", explanationRef: "p2-exp" },
          { id: "p3", left: "l3", right: "r1", explanationRef: "p3-exp" },
        ],
        explanations: {
          "p1-exp": '"Ubiquitous" means present or found everywhere.',
          "p2-exp": '"Meticulous" means showing great attention to detail.',
          "p3-exp": '"Reluctant" means hesitant or unwilling.',
        },
      },
    },
  },
  {
    label: "slots — cloze gaps",
    raw: {
      id: "playground-slots",
      type: "slots",
      payload: {
        prompt: "Fill in the gaps: I ___ (go) to the cinema ___ Friday evenings.",
        input: "typed",
        gaps: [
          { id: "gap-1", acceptedAnswers: ["go"], explanationRef: "gap-1-exp" },
          { id: "gap-2", acceptedAnswers: ["on"], explanationRef: "gap-2-exp" },
        ],
        explanations: {
          "gap-1-exp": "A habitual action uses the simple present: \"I go.\"",
          "gap-2-exp": "Days of the week take the preposition \"on\": \"on Friday evenings.\"",
        },
      },
    },
  },
];
