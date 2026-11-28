/**
 * PROG-023 (docs/decisions/0254) — the Save chip's strings (PROG-024, 0256). English lesson chrome (docs/decisions/
 * 0080 Decision 5), no toggle. Its own small module because it ships on the signed-in learner's
 * first load; the dialog's edit-mode strings stay in lessonNoteCopy, in the dialog's lazy chunk.
 *
 * The save refusals are the dialog's own wording: lessonNoteCopy reads them from here, so the two
 * cannot drift.
 *
 * New copy, pending owner/partner review.
 */
export const saveRefusals = {
  note_cap: "You have 1,000 notes, which is the limit. Delete one in your notebook to add another.",
  not_readable: "This lesson isn't open to you now, so the phrase wasn't saved.",
  unauthenticated: "Your session has ended, so the phrase wasn't saved.",
  failed: "Couldn't save. Try again.",
} as const;

export const selectionSaveCopy = {
  /** The button's label is `${save} “phrase”`. */
  save: "Save",
  saving: "Saving…",
  tooLong: (length: number) => `Select up to 200 characters to save a phrase. This selection has ${length}.`,
  saved: "Saved to your notebook",
  addNote: "Add a note",
  undo: "Undo",
  undoing: "Removing…",
  notebook: "Notebook",
  removed: "Removed from your notebook",
  close: "Close",
  signIn: "Sign in again",
  saveRefusals,
  undoRefusals: {
    unauthenticated: "Your session has ended, so the phrase wasn't removed.",
    failed: "Couldn't remove it. Try again.",
  },
};
