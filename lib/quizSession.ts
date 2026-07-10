import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuizSession } from "@/types";

// How long an active session can sit idle before it is auto-deactivated.
// Handles the "user closed the browser" corner case. Configurable via env.
const TIMEOUT_MIN = Number(process.env.QUIZ_SESSION_TIMEOUT_MINUTES ?? 60);
export const SESSION_TIMEOUT_MS = TIMEOUT_MIN * 60_000;

function isExpired(lastActivityAt: string): boolean {
  return Date.now() - new Date(lastActivityAt).getTime() > SESSION_TIMEOUT_MS;
}

/**
 * The user's single active session, or null. This is the one choke point for
 * lazy inactivity expiry: a session idle longer than SESSION_TIMEOUT_MS is
 * flipped to `abandoned` here and treated as if none exists — so no cron job is
 * needed, and every reader (banner, My Quizzes, start-gate) sees a consistent
 * view.
 */
export async function getActiveSession(
  supabase: SupabaseClient,
  userId: string,
): Promise<QuizSession | null> {
  const { data, error } = await supabase
    .from("quiz_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const session = data as QuizSession;
  if (isExpired(session.last_activity_at)) {
    await supabase
      .from("quiz_sessions")
      .update({ status: "abandoned" })
      .eq("id", session.id);
    return null;
  }
  return session;
}

/** The active session for this specific quiz (for resuming), or null. */
export async function getSessionForQuiz(
  supabase: SupabaseClient,
  userId: string,
  quizId: string,
): Promise<QuizSession | null> {
  const active = await getActiveSession(supabase, userId);
  return active && active.quiz_id === quizId ? active : null;
}

export type ActiveSessionSummary = {
  quizId: string;
  title: string;
  currentIndex: number;
};

/** Active session + its quiz title, for the resume banner / My Quizzes entry. */
export async function getActiveSessionSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActiveSessionSummary | null> {
  const active = await getActiveSession(supabase, userId);
  if (!active) return null;
  const { data } = await supabase
    .from("quizzes")
    .select("title")
    .eq("id", active.quiz_id)
    .single();
  return {
    quizId: active.quiz_id,
    title: (data?.title as string) ?? "Your quiz",
    currentIndex: active.current_index,
  };
}

export type StartResult =
  | { ok: true; session: QuizSession }
  | { ok: false; conflictQuizId: string };

/**
 * Single source of truth for "one active quiz at a time".
 * - active session for the SAME quiz  → touch it, return it (resume);
 * - active session for a DIFFERENT quiz → conflict unless `replace`, in which
 *   case the old one is abandoned first;
 * - no active session → create one.
 */
export async function startOrResumeSession(
  supabase: SupabaseClient,
  userId: string,
  quizId: string,
  opts: { replace?: boolean } = {},
): Promise<StartResult> {
  const active = await getActiveSession(supabase, userId);

  if (active) {
    if (active.quiz_id === quizId) {
      const { data, error } = await supabase
        .from("quiz_sessions")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", active.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return { ok: true, session: data as QuizSession };
    }
    if (!opts.replace) {
      return { ok: false, conflictQuizId: active.quiz_id };
    }
    await supabase
      .from("quiz_sessions")
      .update({ status: "abandoned" })
      .eq("id", active.id);
  }

  const { data, error } = await supabase
    .from("quiz_sessions")
    .insert({ user_id: userId, quiz_id: quizId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return { ok: true, session: data as QuizSession };
}

/** Persist resume progress and bump last_activity_at. */
export async function saveProgress(
  supabase: SupabaseClient,
  userId: string,
  quizId: string,
  currentIndex: number,
  answers: (number | null)[],
): Promise<void> {
  const { error } = await supabase
    .from("quiz_sessions")
    .update({
      current_index: currentIndex,
      answers,
      last_activity_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("quiz_id", quizId)
    .eq("status", "active");
  if (error) throw new Error(error.message);
}

/** Deactivate on Exit-confirm. */
export async function abandonSession(
  supabase: SupabaseClient,
  userId: string,
  quizId: string,
): Promise<void> {
  const { error } = await supabase
    .from("quiz_sessions")
    .update({ status: "abandoned" })
    .eq("user_id", userId)
    .eq("quiz_id", quizId)
    .eq("status", "active");
  if (error) throw new Error(error.message);
}

/** Clear the active session when a quiz is finished (called from results POST). */
export async function completeSession(
  supabase: SupabaseClient,
  userId: string,
  quizId: string,
): Promise<void> {
  const { error } = await supabase
    .from("quiz_sessions")
    .update({ status: "completed" })
    .eq("user_id", userId)
    .eq("quiz_id", quizId)
    .eq("status", "active");
  if (error) throw new Error(error.message);
}
