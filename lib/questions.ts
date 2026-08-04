import path from "path";
import fs from "fs";
import { unstable_cache } from "next/cache";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Question, Quiz, Result, QuizFilter, Subject, Difficulty } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";

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

export type SubjectStat = {
  count: number;
  difficulties: Difficulty[];
  // Per-difficulty counts, so a difficulty-filtered surface (Quick Play's
  // ?difficulty= filter) can show the number of questions it would actually
  // sample instead of the subject total. Always carries all three keys, 0 for
  // a difficulty the subject has none of.
  byDifficulty: Record<Difficulty, number>;
};

export const getSubjectStats = unstable_cache(
  async (): Promise<Record<string, SubjectStat>> => {
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

    const map: Record<string, SubjectStat> = {};
    for (const row of (data ?? []) as { subject: string; difficulty: string; cnt: number }[]) {
      const entry = (map[row.subject] ??= {
        count: 0,
        difficulties: [],
        byDifficulty: { easy: 0, medium: 0, hard: 0 },
      });
      const cnt = Number(row.cnt);
      // count stays the subject total, including any row whose difficulty is
      // outside the known three — byDifficulty only tracks the known ones.
      entry.count += cnt;
      const diff = row.difficulty as Difficulty;
      if (DIFF_ORDER.includes(diff)) entry.byDifficulty[diff] += cnt;
    }

    for (const entry of Object.values(map)) {
      entry.difficulties = DIFF_ORDER.filter((d) => entry.byDifficulty[d] > 0);
    }

    return map;
  },
  // v3: the cached value gained byDifficulty; a warm v2 entry would not have it.
  ["subject-stats-v3"],
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
    // The admin queue moderates the public pool ('shared') AND course questions
    // ('course') that failed the importer's machine verification — the course
    // importer routes an unverified item to status='pending' with visibility
    // 'course' (never 'shared', so it cannot leak into quick play) and writes the
    // reason into critic_notes for a human to adjudicate here. Approving one only
    // flips status, leaving visibility='course', so it becomes visible to enrolled
    // learners without entering the public bank. Group questions are also
    // 'pending' while they await their own group's peer review but are
    // visibility='group', so they stay excluded until a group promotes one to
    // 'shared'. Private questions are created 'approved' (buildQuestionRows), so
    // this filter hides no existing row.
    .in("visibility", ["shared", "course"])
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
  const user = await authUserFrom(supabase);
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

/**
 * Subject ids the user played most recently, most recent first, de-duplicated
 * and capped — the ordering signal for Quick Play's grid.
 *
 * Two bounded queries regardless of how many subjects exist: one pass over the
 * user's latest results (embedding the quiz's question_ids through the
 * results_quiz_id_fkey), then one `in` lookup for those questions' subjects.
 * Nothing here is per-subject or per-card.
 *
 * A result's subject is taken from its quiz's FIRST question, the same
 * attribution getEnrichedResults() uses for history labels. For Quick Play's
 * own single-subject quizzes that is exact; a Random Quiz spanning subjects is
 * credited to one of them, which is fine — the user did play it.
 */
export async function getRecentlyPlayedSubjectIds(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 5,
): Promise<string[]> {
  // Replaying one subject is the common case, so scan more results than the
  // number of distinct subjects wanted — but stay bounded, not full history.
  const SCAN = 60;
  const { data, error } = await supabase
    .from("results")
    .select("taken_at, quizzes(question_ids)")
    .eq("user_id", userId)
    .order("taken_at", { ascending: false })
    .limit(SCAN);
  if (error || !data?.length) return [];

  const rows = data as unknown as { quizzes: { question_ids: string[] | null } | null }[];

  // Walk newest → oldest, keeping first-question ids in that order.
  const firstQuestionIds: string[] = [];
  for (const row of rows) {
    const id = row.quizzes?.question_ids?.[0];
    if (id && !firstQuestionIds.includes(id)) firstQuestionIds.push(id);
  }
  if (firstQuestionIds.length === 0) return [];

  const { data: questions } = await supabase
    .from("questions")
    .select("id, subject")
    .in("id", firstQuestionIds);
  const subjectOf = new Map(
    ((questions ?? []) as { id: string; subject: string }[]).map((q) => [q.id, q.subject]),
  );

  // Re-walk in recency order so the first sighting of a subject fixes its rank.
  const recent: string[] = [];
  for (const questionId of firstQuestionIds) {
    const subject = subjectOf.get(questionId);
    if (subject && !recent.includes(subject)) recent.push(subject);
    if (recent.length === limit) break;
  }
  return recent;
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
  // The quiz rides along on the results select via the results_quiz_id_fkey FK
  // (migration 012) rather than a second `.in("id", quizIds)` round trip. This
  // is on the Progress > Stats critical path, where every serial hop to Supabase
  // is ~120ms of skeleton.
  const { data: results, error } = await supabase
    .from("results")
    .select("*, quiz:quizzes(id, question_ids, difficulty_mix)")
    .eq("user_id", userId)
    .order("taken_at", { ascending: false });

  if (error) throw new Error(error.message);
  const rows = results ?? [];
  if (rows.length === 0) return [];

  const subjects = getSubjects();
  const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));

  // Only the first question of each quiz — its subject drives the label. Still
  // its own query because quizzes.question_ids is a TEXT[], not an FK, so
  // PostgREST cannot embed through it.
  const firstQIds = [
    ...new Set(
      rows
        .map((r: { quiz?: { question_ids?: string[] } | null }) => r.quiz?.question_ids?.[0])
        .filter(Boolean),
    ),
  ];
  const { data: firstQs } = firstQIds.length
    ? await supabase.from("questions").select("id, subject").in("id", firstQIds)
    : { data: [] };
  const questionSubject = new Map((firstQs ?? []).map((q) => [q.id, q.subject as string]));

  return rows.map((r) => {
    const quiz = r.quiz;
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
