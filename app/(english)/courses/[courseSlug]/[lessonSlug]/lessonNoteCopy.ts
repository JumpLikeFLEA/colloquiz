import type { NoteFormFieldStrings } from "../../../my/notebook/NoteForm";
import { saveRefusals } from "./selectionSaveCopy";

/**
 * PROG-022 (docs/decisions/0248) — the lesson's "Add a phrase" dialog. English, like the rest of
 * the lesson chrome (docs/decisions/0080 Decision 5), with no toggle. Only NotebookStripDialog
 * imports this, so it ships in the chunk fetched on the first tap, never on the lesson's first
 * load.
 *
 * New copy, pending owner/partner review.
 */
export const lessonNoteCopy = {
  title: "Add a phrase",
  lead: "Save a phrase from this lesson to your notebook.",
  from: "From:",
  added: "Added to your notebook",
  openNotebook: "Open your notebook",
  addAnother: "Add another",
  close: "Close",
  signIn: "Sign in again",
  form: {
    phraseLabel: "Phrase",
    phraseHint: "Up to 200 characters.",
    noteLabel: "Note (optional)",
    noteHint: "Up to 500 characters. Your notebook holds up to 1,000 of your notes.",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    errors: {
      phrase_empty: "Write a phrase.",
      phrase_too_long: "The phrase is longer than 200 characters.",
      note_too_long: "The note is longer than 500 characters.",
      not_found: "This note is no longer in your notebook.",
      ...saveRefusals,
    },
  } satisfies NoteFormFieldStrings,
  /** PROG-023 (docs/decisions/0254): "Add a note" on a phrase the Save chip (PROG-024, 0256) just saved. */
  edit: {
    title: "Add a note",
    lead: "Add a note to the phrase you saved, or correct the phrase.",
    done: "Note saved",
    save: "Save note",
  },
};
