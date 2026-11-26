import type { NoteFormFieldStrings } from "../../../my/notebook/NoteForm";

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
      note_cap: "You have 1,000 notes, which is the limit. Delete one in your notebook to add another.",
      not_found: "This note is no longer in your notebook.",
      not_readable: "This lesson isn't open to you now, so the phrase wasn't saved.",
      unauthenticated: "Your session has ended, so the phrase wasn't saved.",
      failed: "Couldn't save. Try again.",
    },
  } satisfies NoteFormFieldStrings,
};
