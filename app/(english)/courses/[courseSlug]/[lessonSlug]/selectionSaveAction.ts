"use server";

import { noteAddedId, noteFormError, noteRpcOutcome, type NoteError } from "@/lib/notebook/noteForm";
import { createClient } from "@/lib/supabase/server";

/**
 * PROG-023 (docs/decisions/0253, 0254) — the Save chip's two writes (the bar's until PROG-024, 0256), each one migration-112 RPC under
 * the learner's own session. Like addLessonNote (PROG-022), nothing redirects or refreshes: the
 * lesson's answers, drag positions and typed inputs stay as they are.
 *
 * Callable by anyone, like every Server Action: the arguments are untrusted and passed through as
 * strings; the RPC reads auth.uid(), checks the lesson is readable and owns the limits. An anonymous
 * caller (an expired session) is answered `unauthenticated` here, since `anon` has no EXECUTE on
 * the RPCs (112:538, 112:601) and its permission error would otherwise read "failed".
 */
export type SelectionSaveResult = { ok: true; id: string } | { ok: false; error: NoteError };
export type SelectionUndoResult = { ok: true } | { ok: false; error: NoteError };

const asString = (v: unknown) => (typeof v === "string" ? v : "");

export async function saveSelectedPhrase(phrase: unknown, lessonId: unknown): Promise<SelectionSaveResult> {
  const p = asString(phrase);
  const early = noteFormError(p, "");
  if (early) return { ok: false, error: early };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { data, error } = await supabase.rpc("notebook_add_note", {
    p_phrase: p,
    p_note: null,
    p_lesson_id: asString(lessonId) || null,
  });
  const outcome = noteRpcOutcome(data, error);
  if (!outcome.ok) {
    if (outcome.error === "failed") console.error("lesson: saving a selected phrase failed", error?.message ?? data);
    return { ok: false, error: outcome.error };
  }
  const id = noteAddedId(data);
  if (!id) {
    console.error("lesson: a selected phrase was saved without an id", data);
    return { ok: false, error: "failed" };
  }
  return { ok: true, id };
}

/** Undo: the row the chip just saved. Already gone (another tab) is what the learner asked for. */
export async function undoSelectedPhrase(id: unknown): Promise<SelectionUndoResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { data, error } = await supabase.rpc("notebook_delete_entry", { p_id: asString(id) });
  const outcome = noteRpcOutcome(data, error);
  if (!outcome.ok && outcome.error !== "not_found") {
    if (outcome.error === "failed") console.error("lesson: undoing a selected phrase failed", error?.message ?? data);
    return { ok: false, error: outcome.error };
  }
  return { ok: true };
}
