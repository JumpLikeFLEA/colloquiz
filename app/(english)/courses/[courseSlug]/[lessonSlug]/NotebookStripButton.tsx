"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { NotebookPen } from "lucide-react";

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
 */
const NotebookStripDialog = dynamic(() => import("./NotebookStripDialog").then((m) => m.NotebookStripDialog));

export function NotebookStripButton({ target }: { target: LessonNoteTarget }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Add a phrase"
        aria-haspopup="dialog"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        className="-mr-2 ml-auto flex size-11 flex-none cursor-pointer items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand"
      >
        <NotebookPen className="size-5" aria-hidden="true" />
      </button>
      {loaded && (
        <NotebookStripDialog
          open={open}
          onOpenChange={setOpen}
          target={target}
          // WebKit does not focus a button on a tap or click, so Radix's own
          // "focus what was focused before" would land on <body>: name it.
          returnFocus={() => buttonRef.current?.focus()}
        />
      )}
    </>
  );
}
