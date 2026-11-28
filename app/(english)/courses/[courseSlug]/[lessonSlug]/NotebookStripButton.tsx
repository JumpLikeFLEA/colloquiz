"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { NotebookPen } from "lucide-react";
import { SelectionSaveBar } from "./SelectionSaveBar";

/** Where a phrase added from this lesson is filed (notebook_add_note's lesson, 112). */
export type LessonNoteTarget = {
  lessonId: string;
  courseId: string;
  courseTitle: string;
  lessonTitle: string;
  lessonPath: string;
};

/**
 * PROG-022 (docs/decisions/0246 + 0248) — "Add a phrase", at the right end of the lesson's sticky
 * strip, for a signed-in learner only: only SignedInLessonPageClient renders it, so a signed-out
 * visitor downloads none of it. The dialog behind it is a separate chunk, fetched on the first tap
 * (the AskTeacher precedent, docs/decisions/0153), and stays mounted after that so it can close
 * with its animation and hand focus back here.
 *
 * PROG-023 (docs/decisions/0254 Decision 4): this is the dialog's one owner. The button opens it in
 * add mode; the Save bar under the strip (SelectionSaveBar) opens it in edit mode for the phrase it
 * just saved, and its idle timer waits while the dialog is open. On close focus goes back to the
 * bar's "Add a note" while the bar still shows it, else to this button.
 */
export type NotebookDialogMode = { kind: "add" } | { kind: "edit"; id: string; phrase: string };
const NotebookStripDialog = dynamic(() => import("./NotebookStripDialog").then((m) => m.NotebookStripDialog));

export function NotebookStripButton({ target }: { target: LessonNoteTarget }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<NotebookDialogMode>({ kind: "add" });
  const [loaded, setLoaded] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addNoteRef = useRef<HTMLButtonElement>(null);

  function openDialog(next: NotebookDialogMode) {
    setMode(next);
    setLoaded(true);
    setOpen(true);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Add a phrase"
        aria-haspopup="dialog"
        onClick={() => openDialog({ kind: "add" })}
        className="-mr-2 ml-auto flex size-11 flex-none cursor-pointer items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand"
      >
        <NotebookPen className="size-5" aria-hidden="true" />
      </button>
      <SelectionSaveBar
        target={target}
        dialogOpen={open}
        onAddNote={(id, phrase) => openDialog({ kind: "edit", id, phrase })}
        addNoteRef={addNoteRef}
      />
      {loaded && (
        <NotebookStripDialog
          open={open}
          onOpenChange={setOpen}
          mode={mode}
          target={target}
          // WebKit does not focus a button on a tap or click, so Radix's own
          // "focus what was focused before" would land on <body>: name it.
          returnFocus={() => {
            const addNote = addNoteRef.current;
            if (mode.kind === "edit" && addNote?.isConnected) addNote.focus();
            else buttonRef.current?.focus();
          }}
        />
      )}
    </>
  );
}
