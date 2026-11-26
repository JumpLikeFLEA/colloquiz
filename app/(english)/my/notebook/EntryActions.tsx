"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { deleteNotebookItem, type NoteActionState } from "./actions";
import { NoteForm } from "./NoteForm";
import type { NoteFormStrings } from "./noteFormCopy";

/**
 * PROG-016 (docs/decisions/0241) — a row's Edit (own notes only: copied text is never editable)
 * and Delete. Delete opens a confirmation in place that names what goes; "Yes, delete" calls
 * `notebook_delete_entry` or `notebook_delete_summary`. Nothing is removed on the first tap.
 */
const INITIAL: NoteActionState = { error: null, done: 0 };
const ACTION_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand";
const CONFIRM_YES_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-ink bg-destructive px-4 py-2 text-sm font-semibold text-white outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60";
const CONFIRM_NO_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-ink bg-card px-4 py-2 text-sm font-semibold text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

type Mode = "idle" | "edit" | "confirm";

export function EntryActions({
  strings,
  kind,
  id,
  confirm,
  edit,
  label,
}: {
  strings: NoteFormStrings;
  kind: "entry" | "summary";
  id: string;
  confirm: { title: string; body: string };
  /** Present for an own note only. */
  edit?: { phrase: string; note: string | null };
  /** What the buttons act on, for their accessible names. */
  label: string;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [state, action, pending] = useActionState(deleteNotebookItem, INITIAL);
  const editButton = useRef<HTMLButtonElement>(null);
  const closeEdit = useCallback(() => {
    setMode("idle");
    editButton.current?.focus();
  }, []);
  const yes = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (mode === "confirm") yes.current?.focus();
  }, [mode]);

  return (
    <div className="flex flex-col gap-2" data-notebook-actions={kind}>
      <div className="flex flex-wrap justify-end gap-1">
        {edit && (
          <button
            ref={editButton}
            type="button"
            aria-expanded={mode === "edit"}
            aria-label={`${strings.edit}: ${label}`}
            onClick={() => setMode(mode === "edit" ? "idle" : "edit")}
            className={ACTION_CLASS}
          >
            <Pencil className="size-4" aria-hidden="true" />
            {strings.edit}
          </button>
        )}
        <button
          type="button"
          aria-expanded={mode === "confirm"}
          aria-label={`${strings.delete}: ${label}`}
          onClick={() => setMode(mode === "confirm" ? "idle" : "confirm")}
          className={ACTION_CLASS}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {strings.delete}
        </button>
      </div>
      {mode === "edit" && edit && (
        <div className="rounded-xl border-2 border-ink/30 bg-card p-3 sm:p-4">
          <NoteForm strings={strings} id={id} initial={edit} onDone={closeEdit} />
        </div>
      )}
      {mode === "confirm" && (
        <form
          action={action}
          role="alertdialog"
          aria-labelledby={`confirm-${id}`}
          className="flex flex-col gap-3 rounded-xl border-2 border-destructive-border bg-destructive-subtle p-3 sm:p-4"
          data-notebook="confirm"
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="kind" value={kind} />
          <p id={`confirm-${id}`} className="break-words text-sm font-semibold text-foreground">
            {confirm.title}
          </p>
          <p className="break-words text-sm text-muted-foreground">{confirm.body}</p>
          {state.error && !pending && (
            <p className="text-sm text-destructive-text" aria-live="polite">
              {state.error === "unauthenticated" ? strings.errors.unauthenticated : strings.deleteFailed}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button ref={yes} type="submit" disabled={pending} className={CONFIRM_YES_CLASS}>
              {pending ? strings.deleting : strings.confirmYes}
            </button>
            <button type="button" onClick={() => setMode("idle")} className={CONFIRM_NO_CLASS}>
              {strings.cancel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
