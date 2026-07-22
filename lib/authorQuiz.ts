import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Question, Difficulty } from "@/types";

export type IncomingQuestion = {
  question: string;
  type: "multiple_choice" | "true_false";
  options: [string, string, string, string];
  correct_answer: string;
  explanation: string;
  difficulty: Difficulty;
  tags: string[];
  submitToPool?: boolean;
};

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/**
 * Validates one builder-payload question. Returns an error string, or null if
 * the payload is usable. The solo builder posts a whole quiz at once and
 * validates client-side; the group builder saves one question at a time
 * against the API, so it needs a server-side check per question.
 */
export function validateIncomingQuestion(q: IncomingQuestion): string | null {
  if (!q || typeof q !== "object") return "question payload is required";
  if (!q.question?.trim()) return "question text is required";
  if (q.type !== "multiple_choice" && q.type !== "true_false") {
    return "type must be multiple_choice or true_false";
  }
  if (!DIFFICULTIES.includes(q.difficulty)) return "difficulty must be easy, medium or hard";

  const options =
    q.type === "true_false" ? ["True", "False"] : (q.options ?? []).filter((o) => o?.trim());
  if (q.type === "multiple_choice" && options.length !== 4) {
    return "a multiple-choice question needs all 4 options";
  }
  if (!q.correct_answer?.trim()) return "correct_answer is required";
  if (!options.includes(q.correct_answer)) {
    return "correct_answer must be one of the options";
  }
  return null;
}

/**
 * Resolves the caller and confirms they may author content (author flag or
 * admin). Returns either `{ user }` or `{ error }` — a ready NextResponse.
 */
export async function requireAuthor(
  supabase: SupabaseClient,
): Promise<{ user: { id: string }; error?: never } | { user?: never; error: NextResponse }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_author, role")
    .eq("id", user.id)
    .single();
  if (!profile?.is_author && profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

/**
 * Turns builder payload questions into DB rows.
 *
 * Solo path (no `groupId`): private by default; a question flagged
 * `submitToPool` becomes shared + pending so it enters the existing admin
 * review queue while the author keeps their private copy behaviour.
 *
 * Group path (`groupId` given): the row is owned by the group and always
 * enters the group's own review queue as pending, since a member cannot vouch
 * for their own draft. `submitToPool` is ignored here — promotion to the
 * public pool is a separate action, allowed only once the group has approved
 * the question (enforced by the guard trigger in migration 014).
 */
export function buildQuestionRows(
  incoming: IncomingQuestion[],
  subject: string,
  userId: string,
  groupId?: string,
): Question[] {
  const now = new Date().toISOString();
  return incoming.map((q) => {
    const options: [string, string, string, string] =
      q.type === "true_false" ? ["True", "False", "", ""] : q.options;
    const toPool = q.submitToPool === true;
    const base = {
      id: generateId("q"),
      type: "multiple_choice" as const,
      subject,
      tags: q.tags ?? [],
      difficulty: q.difficulty,
      question: q.question,
      options,
      correct_answer: q.correct_answer,
      explanation: q.explanation ?? "",
      created_at: now,
      source: "manual" as const,
      created_by: userId,
    };
    if (groupId) {
      return {
        ...base,
        status: "pending" as const,
        visibility: "group" as const,
        group_id: groupId,
      };
    }
    return {
      ...base,
      status: toPool ? ("pending" as const) : ("approved" as const),
      visibility: toPool ? ("shared" as const) : ("private" as const),
    };
  });
}
