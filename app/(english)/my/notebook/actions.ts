"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { NOTEBOOK_PATH } from "@/lib/notebook/href";
import { noteFormError, noteRpcOutcome, type NoteError } from "@/lib/notebook/noteForm";
import { createClient } from "@/lib/supabase/server";

/**
 * PROG-016 (docs/decisions/0241) — the notebook's writes. Each is one migration-112 RPC under the
 * learner's own session: the RPC reads `auth.uid()`, so an id that is not the caller's answers
 * `not_found` and nothing here decides ownership. Copied text has no edit action; only an own note
 * is edited (`notebook_edit_note` refuses anything else).
 *
 * Callable by anyone, like every Server Action: every argument is untrusted and is passed through
 * as a string, never interpreted.
 */
export type NoteActionState = { error: NoteError | null; done: number };

const str = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
};

export async function saveNote(prev: NoteActionState, form: FormData): Promise<NoteActionState> {
  const id = str(form, "id");
  const phrase = str(form, "phrase");
  const note = str(form, "note");
  // The form checks the same rule; this spares a round trip, the RPC is the authority.
  const early = noteFormError(phrase, note);
  if (early) return { error: early, done: prev.done };

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.rpc("notebook_edit_note", { p_id: id, p_phrase: phrase, p_note: note })
    : await supabase.rpc("notebook_add_note", { p_phrase: phrase, p_note: note });
  const outcome = noteRpcOutcome(data, error);
  if (!outcome.ok) {
    if (outcome.error === "failed") console.error("/my/notebook: saving a note failed", error?.message ?? data);
    return { error: outcome.error, done: prev.done };
  }
  // A new note has no lesson, so it shows under Phrases, All courses: open that view.
  if (!id) redirect(NOTEBOOK_PATH);
  refresh();
  return { error: null, done: prev.done + 1 };
}

export async function deleteNotebookItem(prev: NoteActionState, form: FormData): Promise<NoteActionState> {
  const id = str(form, "id");
  const summary = str(form, "kind") === "summary";
  const supabase = await createClient();
  const { data, error } = summary
    ? await supabase.rpc("notebook_delete_summary", { p_submission_id: id })
    : await supabase.rpc("notebook_delete_entry", { p_id: id });
  const outcome = noteRpcOutcome(data, error);
  // Already gone (another tab) is what the learner asked for: refresh and show it gone.
  if (!outcome.ok && outcome.error !== "not_found") {
    if (outcome.error === "failed") console.error("/my/notebook: deleting failed", error?.message ?? data);
    return { error: outcome.error, done: prev.done };
  }
  refresh();
  return { error: null, done: prev.done + 1 };
}
