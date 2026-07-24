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

// Fetch only the questions a quiz/result references. Bounded by the id list,
// so it is immune to PostgREST's 1000-row response cap — unlike a full-table
// select, which silently truncates once the table exceeds 1000 rows.
export async function getQuestionsByIds(ids: string[]): Promise<Question[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("questions").select("*").in("id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as Question[];
}

// Full-table fetch. PostgREST caps a single response at 1000 rows, so page
// through with .range() to return every question once the table exceeds that.
// Prefer getQuestionsByIds / getSubjectStats where you don't need the whole set.
export async function getQuestions(): Promise<Question[]> {
  const supabase = await createClient();
  const PAGE = 1000;
  const all: Question[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Question[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
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
    // DB-side GROUP BY (see migration 008) — returns one row per (subject,
    // difficulty) with a count, instead of every question row.
    const { data, error } = await supabase.rpc("get_subject_stats");
    if (error) throw new Error(error.message);

    const map: Record<string, { count: number; diffSet: Set<Difficulty> }> = {};
    for (const row of (data ?? []) as { subject: string; difficulty: string; cnt: number }[]) {
      const entry = map[row.subject] ?? { count: 0, diffSet: new Set() };
      entry.count += Number(row.cnt);
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
  ["subject-stats-v2"],
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
    // The admin queue moderates the PUBLIC pool only. Group questions are
    // also 'pending' while they await their own group's peer review, and must
    // not appear here — they reach this queue only once a group promotes one,
    // which flips visibility to 'shared'. Private questions are created
    // 'approved' (buildQuestionRows), so this filter hides no existing row.
    .eq("visibility", "shared")
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

  // Only ever sample from the public pool. RLS also lets an author read their
  // own private questions and a student read questions of an assigned quiz —
  // filter explicitly so private questions never leak into random quizzes.
  let query = supabase
    .from("questions")
    .select("*")
    .eq("status", "approved")
    .eq("visibility", "shared");

  // A requested subject filters on questions.subject directly. This used to be
  // approximated by looking up subjects.json `tags` and doing a tag overlap —
  // but 13 of the 19 subjects have `tags: []`, so the overlap was skipped
  // entirely and "Mathematics → Medium" sampled the whole pool. Deep Dive was
  // hit too: it sends subject AND subtopic tags, so a tag-only match pulled in
  // same-named subtopics from other subjects.
  if (filter.subject) {
    query = query.eq("subject", filter.subject);
  }
  if (filter.difficulty !== "mixed") {
    query = query.eq("difficulty", filter.difficulty);
  }
  // Subtopics narrow within the subject. With no subject (Random Quiz, tag-only
  // selections) this is the only content filter, as before.
  if (filter.tags.length > 0) {
    query = query.overlaps("tags", filter.tags);
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
  const rows = results ?? [];
  if (rows.length === 0) return [];

  const subjects = getSubjects();
  const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));

  // Fetch only the quizzes these results reference (not the whole table), then
  // only the first question of each quiz — its subject drives the label. Two
  // bounded queries instead of getQuestions() (full table) + one getQuizById per row.
  const quizIds = [...new Set(rows.map((r) => r.quiz_id))];
  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("id, question_ids, difficulty_mix")
    .in("id", quizIds);
  const quizMap = new Map((quizzes ?? []).map((q) => [q.id, q]));

  const firstQIds = [
    ...new Set(
      Array.from(quizMap.values())
        .map((q) => q.question_ids?.[0])
        .filter(Boolean),
    ),
  ];
  const { data: firstQs } = firstQIds.length
    ? await supabase.from("questions").select("id, subject").in("id", firstQIds)
    : { data: [] };
  const questionSubject = new Map((firstQs ?? []).map((q) => [q.id, q.subject as string]));

  return rows.map((r) => {
    const quiz = quizMap.get(r.quiz_id);
    let subject = "Mixed";
    if (quiz) {
      const firstSubjectId = questionSubject.get(quiz.question_ids?.[0]);
      if (firstSubjectId) subject = subjectMap.get(firstSubjectId) ?? firstSubjectId;
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
  });
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
