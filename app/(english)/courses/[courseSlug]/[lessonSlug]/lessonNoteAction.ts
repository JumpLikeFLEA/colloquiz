"use server";

import { noteFormError, noteRpcOutcome } from "@/lib/notebook/noteForm";
import { createClient } from "@/lib/supabase/server";
import type { NoteActionState } from "../../../my/notebook/actions";

/**
 * PROG-022 (docs/decisions/0248) — "Add a phrase" from inside a lesson. One `notebook_add_note`
 * call (112) under the learner's own session, with the lesson, so the note keeps its course and
 * lesson; the RPC decides whether that lesson is readable (`not_readable`) and enforces the limits
 * and the cap. The form checks the same limits first (lib/notebook/noteForm), only to spare a round
 * trip.
 *
 * Unlike the notebook page's `saveNote`, nothing here redirects or refreshes: re-rendering the
 * lesson page would hand the player a new attemptId (0086, 0153), and the learner's answers must
 * stay as they are. Success reaches the dialog through NoteForm's `onDone`.
 *
 * Callable by anyone, like every Server Action: every argument is untrusted and is passed through
 * as a string. An anonymous caller (an expired session) is answered `unauthenticated` here, since
 * `anon` has no EXECUTE on the RPC (112:538) and its permission error would otherwise read "failed".
 */
const str = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
};

export async function addLessonNote(prev: NoteActionState, form: FormData): Promise<NoteActionState> {
  const phrase = str(form, "phrase");
  const note = str(form, "note");
  const lessonId = str(form, "lessonId");
  const early = noteFormError(phrase, note);
  if (early) return { error: early, done: prev.done };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthenticated", done: prev.done };

  const { data, error } = await supabase.rpc("notebook_add_note", {
    p_phrase: phrase,
    p_note: note,
    p_lesson_id: lessonId || null,
  });
  const outcome = noteRpcOutcome(data, error);
  if (!outcome.ok) {
    if (outcome.error === "failed") console.error("lesson: adding a notebook note failed", error?.message ?? data);
    return { error: outcome.error, done: prev.done };
  }
  return { error: null, done: prev.done + 1 };
}

/**
 * PROG-023 (docs/decisions/0254) — "Add a note" on a phrase the Save bar just saved: the same
 * dialog's edit mode, `notebook_edit_note` (112:541) under the learner's session. No refresh, for
 * the same reason as above.
 */
export async function editLessonNote(prev: NoteActionState, form: FormData): Promise<NoteActionState> {
  const id = str(form, "id");
  const phrase = str(form, "phrase");
  const note = str(form, "note");
  const early = noteFormError(phrase, note);
  if (early) return { error: early, done: prev.done };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthenticated", done: prev.done };

  const { data, error } = await supabase.rpc("notebook_edit_note", { p_id: id, p_phrase: phrase, p_note: note });
  const outcome = noteRpcOutcome(data, error);
  if (!outcome.ok) {
    if (outcome.error === "failed") console.error("lesson: editing a notebook note failed", error?.message ?? data);
    return { error: outcome.error, done: prev.done };
  }
  return { error: null, done: prev.done + 1 };
}
