"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { notebookHref } from "@/lib/notebook/href";
import { NoteForm } from "../../../my/notebook/NoteForm";
import { OFFSET_CTA_CLASS, OUTLINE_CTA_CLASS, PAPER_LINK_CLASS, PAPER_LINK_INLINE_CLASS } from "../../../surfaceClasses";
import { addLessonNote } from "./lessonNoteAction";
import { lessonNoteCopy as t } from "./lessonNoteCopy";
import type { LessonNoteTarget } from "./NotebookStripButton";

/**
 * PROG-022 (docs/decisions/0248) — the "Add a phrase" dialog: Phrase, Note, where the note will be
 * filed, Save. The form is the notebook's own NoteForm (its limits and counters,
 * lib/notebook/noteForm) with the lesson's action, which never redirects or refreshes, so the
 * lesson's answers stay as they were.
 *
 * Pinned to the top of the screen (`top-4`, no vertical centring) so an on-screen keyboard, which
 * covers the bottom of the viewport, cannot cover the fields; it scrolls inside itself when it is
 * taller than the screen.
 *
 * After a save the dialog stays open on its own success state (owner, 2026-11-26, 0248): a
 * `role="status"` line that takes focus, a link to the notebook on this course, "Add another" and
 * Close. Nothing is added to the strip.
 */
export function NotebookStripDialog({
  open,
  onOpenChange,
  target,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: LessonNoteTarget;
  returnFocus: () => void;
}) {
  const [added, setAdded] = useState(false);
  // Remounts the form for "Add another", so it starts empty.
  const [formKey, setFormKey] = useState(0);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (added) statusRef.current?.focus();
  }, [added]);

  const signIn = `/login?next=${encodeURIComponent(target.lessonPath)}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        // The next open starts on an empty form.
        if (!next) setAdded(false);
      }}
    >
      <DialogContent
        className="top-4 max-h-[calc(100dvh-2rem)] translate-y-0 overflow-y-auto"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.lead}</DialogDescription>
        </DialogHeader>
        <p className="break-words text-sm text-muted-foreground" data-notebook="from">
          {t.from} {target.courseTitle} · {target.lessonTitle}
        </p>
        {added ? (
          <div className="flex flex-col items-start gap-4">
            <div
              ref={statusRef}
              role="status"
              tabIndex={-1}
              className="flex items-center gap-2 rounded-lg text-base font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <CheckCircle2 className="size-5 flex-none text-success" aria-hidden="true" />
              {t.added}
            </div>
            <Link href={notebookHref("phrases", target.courseId)} className={PAPER_LINK_CLASS}>
              {t.openNotebook}
            </Link>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setFormKey((k) => k + 1);
                  setAdded(false);
                }}
                className={OFFSET_CTA_CLASS}
              >
                {t.addAnother}
              </button>
              <button type="button" onClick={() => onOpenChange(false)} className={OUTLINE_CTA_CLASS}>
                {t.close}
              </button>
            </div>
          </div>
        ) : (
          <NoteForm
            key={formKey}
            strings={t.form}
            action={addLessonNote}
            hidden={{ lessonId: target.lessonId }}
            onDone={() => setAdded(true)}
            autoFocus={formKey > 0}
            errorExtra={{
              unauthenticated: (
                <>
                  {" "}
                  <a href={signIn} className={PAPER_LINK_INLINE_CLASS}>
                    {t.signIn}
                  </a>
                </>
              ),
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
