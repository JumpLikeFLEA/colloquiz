import path from "path";
import fs from "fs";
import { unstable_cache } from "next/cache";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Question, Quiz, Result, QuizFilter, Subject, Difficulty } from "@/types";
import { createClient } from "@/lib/supabase/server";

// subjects.json stays on disk — it's static config, not user data
const DATA_DIR = path.join(process.cwd(), "data");

export function getSubjects(): Subject[] {
  const raw = fs.readFileSync(path.join(DATA_DIR, "subjects.json"), "utf-8");
  return JSON.parse(raw) as Subject[];
}

export async function getQuestions(): Promise<Question[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("questions").select("*");
  if (error) throw new Error(error.message);
  return (data ?? []) as Question[];
}

const DIFF_ORDER: Difficulty[] = ["easy", "medium", "hard"];

export const getSubjectStats = unstable_cache(
  async (): Promise<Record<string, { count: number; difficulties: Difficulty[] }>> => {
    // Cannot use createClient() here — it calls cookies() which is forbidden inside unstable_cache.
    // The anon key hits the same RLS policies; no service-role bypass.
    const supabase = createAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase
      .from("questions")
      .select("subject, difficulty")
      .eq("status", "approved")
      .eq("visibility", "shared");
    if (error) throw new Error(error.message);

    const map: Record<string, { count: number; diffSet: Set<Difficulty> }> = {};
    for (const row of data ?? []) {
      const entry = map[row.subject] ?? { count: 0, diffSet: new Set() };
      entry.count += 1;
      entry.diffSet.add(row.difficulty as Difficulty);
      map[row.subject] = entry;
    }

    return Object.fromEntries(
      Object.entries(map).map(([subject, { count, diffSet }]) => [
        subject,
        { count, difficulties: DIFF_ORDER.filter((d) => diffSet.has(d)) },
      ])
    );
  },
  ["subject-stats-v1"],
  { revalidate: 60, tags: ["subject-stats"] }
);

export async function getPendingQuestions(
  page: number = 1,
  pageSize: number = 10,
): Promise<{ questions: Question[]; total: number }> {
  const supabase = await createClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await supabase
    .from("questions")
    .select("*", { count: "exact" })
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);
  return {
    questions: (data ?? []) as Question[],
    total: count ?? 0,
  };
}

export async function getQuizById(id: string): Promise<Quiz | undefined> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quizzes")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return undefined;
  return data as Quiz;
}

export async function getResults(): Promise<Result[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("results")
    .select("*")
    .eq("user_id", user.id)
    .order("taken_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Result[];
}

export async function saveResult(result: Result, userId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("results")
    .insert({ ...result, user_id: userId });
  if (error) throw new Error(error.message);
}

export async function saveQuiz(quiz: Quiz, userId?: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("quizzes")
    .insert({ ...quiz, created_by: userId ?? null });
  if (error) throw new Error(error.message);
}

export async function saveQuestions(newQuestions: Question[], userId?: string): Promise<void> {
  const supabase = await createClient();
  const rows = newQuestions.map((q) => ({
    ...q,
    created_by: userId ?? null,
  }));
  const { error } = await supabase.from("questions").insert(rows);
  if (error) throw new Error(error.message);
}

export async function sampleQuestions(filter: QuizFilter): Promise<Question[]> {
  const supabase = await createClient();

  let effectiveTags = filter.tags;
  if (filter.subject && effectiveTags.length === 0) {
    const subjects = getSubjects();
    const subject = subjects.find((s) => s.id === filter.subject);
    if (subject) effectiveTags = subject.tags;
  }

  // Only ever sample from the public pool. RLS also lets an author read their
  // own private questions and a student read questions of an assigned quiz —
  // filter explicitly so private questions never leak into random quizzes.
  let query = supabase
    .from("questions")
    .select("*")
    .eq("status", "approved")
    .eq("visibility", "shared");

  if (filter.difficulty !== "mixed") {
    query = query.eq("difficulty", filter.difficulty);
  }
  if (effectiveTags.length > 0) {
    query = query.overlaps("tags", effectiveTags);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const pool = (data ?? []) as Question[];
  const count = filter.mode === "exam" ? 50 : filter.size;
  return shuffle(pool).slice(0, count);
}

export async function getAllTags(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("questions")
    .select("tags")
    .eq("status", "approved")
    .eq("visibility", "shared");
  if (error) throw new Error(error.message);
  const tagSet = new Set<string>();
  (data ?? []).forEach((row: { tags: string[] }) => row.tags.forEach((t) => tagSet.add(t)));
  return Array.from(tagSet).sort();
}

export type EnrichedResult = {
  id: string;
  mode: string;
  score: number;
  correct: number;
  total_questions: number;
  taken_at: string;
  time_taken: number;
  subject: string;
  difficulty: string;
};

export async function getEnrichedResults(
  supabase: SupabaseClient,
  userId: string,
): Promise<EnrichedResult[]> {
  const { data: results, error } = await supabase
    .from("results")
    .select("*")
    .eq("user_id", userId)
    .order("taken_at", { ascending: false });

  if (error) throw new Error(error.message);

  const allQuestions = await getQuestions();
  const subjects = getSubjects();
  const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));

  return Promise.all(
    (results ?? []).map(async (r) => {
      const quiz = await getQuizById(r.quiz_id);
      let subject = "Mixed";
      if (quiz) {
        const firstQ = allQuestions.find((q) => q.id === quiz.question_ids[0]);
        if (firstQ?.subject) subject = subjectMap.get(firstQ.subject) ?? firstQ.subject;
      }
      return {
        id: r.id,
        mode: r.mode,
        score: r.score,
        correct: r.correct,
        total_questions: r.total_questions,
        taken_at: r.taken_at,
        time_taken: r.time_taken,
        subject,
        difficulty: quiz?.difficulty_mix ?? "mixed",
      };
    }),
  );
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
