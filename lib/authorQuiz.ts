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
 * Turns builder payload questions into DB rows. Private by default; a question
 * flagged `submitToPool` becomes shared + pending so it enters the existing
 * admin review queue while the author keeps their private copy behaviour.
 */
export function buildQuestionRows(
  incoming: IncomingQuestion[],
  subject: string,
  userId: string,
): Question[] {
  const now = new Date().toISOString();
  return incoming.map((q) => {
    const options: [string, string, string, string] =
      q.type === "true_false" ? ["True", "False", "", ""] : q.options;
    const toPool = q.submitToPool === true;
    return {
      id: generateId("q"),
      type: "multiple_choice",
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
      status: toPool ? ("pending" as const) : ("approved" as const),
      visibility: toPool ? "shared" : "private",
    };
  });
}
