"use client";

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { NOTE_MAX, noteFormError, noteLength, PHRASE_MAX, type NoteError } from "@/lib/notebook/noteForm";
import { OFFSET_CTA_CLASS, OUTLINE_CTA_CLASS } from "../../surfaceClasses";
import { saveNote, type NoteActionState } from "./actions";
import type { NoteFormStrings } from "./noteFormCopy";

/**
 * PROG-016 (docs/decisions/0241) — add or edit an own note. The limits are shown as counters and
 * checked before sending (lib/notebook/noteForm, 112's rule mirrored); `notebook_add_note` /
 * `notebook_edit_note` decide. The field keeps what was typed when a save is refused.
 *
 * PROG-022 (docs/decisions/0248): the lesson's "Add a phrase" dialog reuses this form with its own
 * `action` (no redirect), its English `strings`, the lesson id as a `hidden` field, and `onDone`
 * as its success callback. Without those props the notebook page's form is unchanged.
 */
const INITIAL: NoteActionState = { error: null, done: 0 };
const FIELD_CLASS = "paper-input w-full rounded-xl px-3 py-2.5 text-base";
const ERROR_CLASS = "rounded-xl bg-destructive-subtle px-3 py-2 text-sm text-destructive-text";

function Counter({ value, max, id }: { value: string; max: number; id: string }) {
  const n = noteLength(value);
  return (
    <span id={id} className={`text-xs tabular-nums ${n > max ? "text-destructive-text" : "text-muted-foreground"}`}>
      {n} / {max}
    </span>
  );
}

/** What the form draws; the notebook passes its whole copy, the lesson dialog only these. */
export type NoteFormFieldStrings = Pick<
  NoteFormStrings,
  "phraseLabel" | "phraseHint" | "noteLabel" | "noteHint" | "save" | "saving" | "cancel" | "errors"
>;

export function NoteForm({
  strings,
  id,
  initial,
  onDone,
  onCancel,
  action: save = saveNote,
  hidden,
  errorExtra,
  autoFocus,
}: {
  strings: NoteFormFieldStrings;
  /** Present when editing. */
  id?: string;
  initial?: { phrase: string; note: string | null };
  /** Called after each successful save. */
  onDone?: () => void;
  /** Cancel while editing; `onDone` when absent (the notebook page). */
  onCancel?: () => void;
  /** The Server Action; the notebook page's `saveNote` when absent. */
  action?: (prev: NoteActionState, form: FormData) => Promise<NoteActionState>;
  /** Extra hidden fields sent with the form (the lesson id). */
  hidden?: Record<string, string>;
  /** Drawn after a refusal's message (the expired session's sign-in link). */
  errorExtra?: Partial<Record<NoteError, ReactNode>>;
  /** Focus the phrase field on mount. */
  autoFocus?: boolean;
}) {
  const [state, action, pending] = useActionState(save, INITIAL);
  const [phrase, setPhrase] = useState(initial?.phrase ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [local, setLocal] = useState<NoteError | null>(null);
  const uid = useId();
  const doneRef = useRef(state.done);

  useEffect(() => {
    if (state.done !== doneRef.current) {
      doneRef.current = state.done;
      onDone?.();
    }
  }, [state.done, onDone]);

  // A refusal from the last send is not shown while the next one is on its way.
  const error = local ?? (pending ? null : state.error);
  const phraseBad = error === "phrase_empty" || error === "phrase_too_long";
  const noteBad = error === "note_too_long";

  return (
    <form
      action={action}
      noValidate
      onSubmit={(e) => {
        const err = noteFormError(phrase, note);
        setLocal(err);
        if (err) e.preventDefault();
      }}
      className="flex flex-col gap-3"
      data-notebook={id ? "edit-form" : "add-form"}
    >
      {id && <input type="hidden" name="id" value={id} />}
      {hidden &&
        Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={`${uid}-phrase`} className="text-sm font-semibold text-foreground">
            {strings.phraseLabel}
          </label>
          <Counter value={phrase} max={PHRASE_MAX} id={`${uid}-phrase-count`} />
        </div>
        <input
          id={`${uid}-phrase`}
          name="phrase"
          lang="en"
          autoComplete="off"
          autoFocus={autoFocus}
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          aria-invalid={phraseBad || undefined}
          aria-describedby={`${uid}-phrase-hint ${uid}-phrase-count${phraseBad ? ` ${uid}-error` : ""}`}
          className={`${FIELD_CLASS} ${phraseBad ? "!border-destructive-border" : ""}`}
        />
        <p id={`${uid}-phrase-hint`} className="text-xs text-muted-foreground">
          {strings.phraseHint}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={`${uid}-note`} className="text-sm font-semibold text-foreground">
            {strings.noteLabel}
          </label>
          <Counter value={note} max={NOTE_MAX} id={`${uid}-note-count`} />
        </div>
        <textarea
          id={`${uid}-note`}
          name="note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-invalid={noteBad || undefined}
          aria-describedby={`${uid}-note-hint ${uid}-note-count${noteBad ? ` ${uid}-error` : ""}`}
          className={`${FIELD_CLASS} min-h-24 resize-none [field-sizing:content] ${noteBad ? "!border-destructive-border" : ""}`}
        />
        <p id={`${uid}-note-hint`} className="text-xs text-muted-foreground">
          {strings.noteHint}
        </p>
      </div>
      <div aria-live="polite">
        {error && (
          <p id={`${uid}-error`} className={ERROR_CLASS} data-notebook="form-error">
            {strings.errors[error]}
            {errorExtra?.[error]}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={`${OFFSET_CTA_CLASS} disabled:pointer-events-none disabled:opacity-60`}>
          {pending ? strings.saving : strings.save}
        </button>
        {(onCancel ?? onDone) && id && (
          <button type="button" onClick={onCancel ?? onDone} className={OUTLINE_CTA_CLASS}>
            {strings.cancel}
          </button>
        )}
      </div>
    </form>
  );
}
