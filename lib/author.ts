import type { SupabaseClient } from "@supabase/supabase-js";
import type { Assignment, Question, Quiz, Result, StoredAnswer } from "@/types";

// ── Author's own created quizzes (private, authored — not ephemeral sessions) ──

export type CreatedQuiz = {
  id: string;
  title: string;
  questionCount: number;
  assignedCount: number;
  completedCount: number;
  created_at: string;
};

export async function getMyCreatedQuizzes(
  supabase: SupabaseClient,
  userId: string,
): Promise<CreatedQuiz[]> {
  const { data: quizzes, error } = await supabase
    .from("quizzes")
    .select("*")
    .eq("created_by", userId)
    .eq("visibility", "private")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (quizzes ?? []) as Quiz[];
  if (rows.length === 0) return [];

  const { data: assignments } = await supabase
    .from("assignments")
    .select("quiz_id, status")
    .eq("tutor_id", userId)
    .in("quiz_id", rows.map((q) => q.id));

  const counts = new Map<string, { assigned: number; completed: number }>();
  for (const a of assignments ?? []) {
    const c = counts.get(a.quiz_id) ?? { assigned: 0, completed: 0 };
    c.assigned += 1;
    if (a.status === "completed") c.completed += 1;
    counts.set(a.quiz_id, c);
  }

  return rows.map((q) => {
    const c = counts.get(q.id) ?? { assigned: 0, completed: 0 };
    return {
      id: q.id,
      title: q.title,
      questionCount: q.question_ids.length,
      assignedCount: c.assigned,
      completedCount: c.completed,
      created_at: q.created_at,
    };
  });
}

// ── Assignments handed to the current user (student view) ──

export type MyAssignment = {
  id: string;
  quizId: string;
  quizTitle: string;
  tutorName: string;
  status: Assignment["status"];
  assignedAt: string;
  dueAt: string | null;
  resultId: string | null;
};

export async function getMyAssignments(
  supabase: SupabaseClient,
  userId: string,
): Promise<MyAssignment[]> {
  const { data: assignments, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("student_id", userId)
    .order("assigned_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (assignments ?? []) as Assignment[];
  if (rows.length === 0) return [];

  const quizIds = [...new Set(rows.map((a) => a.quiz_id))];
  const tutorIds = [...new Set(rows.map((a) => a.tutor_id))];

  const [{ data: quizzes }, { data: tutors }] = await Promise.all([
    supabase.from("quizzes").select("id, title").in("id", quizIds),
    supabase.from("profiles").select("id, display_name, full_name").in("id", tutorIds),
  ]);

  const quizTitle = new Map((quizzes ?? []).map((q) => [q.id, q.title as string]));
  const tutorName = new Map(
    (tutors ?? []).map((t) => [t.id, (t.full_name || t.display_name || "Tutor") as string]),
  );

  return rows.map((a) => ({
    id: a.id,
    quizId: a.quiz_id,
    quizTitle: quizTitle.get(a.quiz_id) ?? "Quiz",
    tutorName: tutorName.get(a.tutor_id) ?? "Tutor",
    status: a.status,
    assignedAt: a.assigned_at,
    dueAt: a.due_at ?? null,
    resultId: a.result_id ?? null,
  }));
}

// ── Tutor's linked students, with progress counts ──

export type LinkedStudent = {
  id: string;
  name: string;
  linkedAt: string;
  assignedCount: number;
  completedCount: number;
};

export async function getLinkedStudents(
  supabase: SupabaseClient,
  userId: string,
): Promise<LinkedStudent[]> {
  const { data: links, error } = await supabase
    .from("tutor_students")
    .select("student_id, created_at")
    .eq("tutor_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = links ?? [];
  if (rows.length === 0) return [];

  const studentIds = rows.map((r) => r.student_id);

  const [{ data: profiles }, { data: assignments }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, full_name").in("id", studentIds),
    supabase.from("assignments").select("student_id, status").eq("tutor_id", userId),
  ]);

  const name = new Map(
    (profiles ?? []).map((p) => [p.id, (p.full_name || p.display_name || "Student") as string]),
  );
  const counts = new Map<string, { assigned: number; completed: number }>();
  for (const a of assignments ?? []) {
    const c = counts.get(a.student_id) ?? { assigned: 0, completed: 0 };
    c.assigned += 1;
    if (a.status === "completed") c.completed += 1;
    counts.set(a.student_id, c);
  }

  return rows.map((r) => {
    const c = counts.get(r.student_id) ?? { assigned: 0, completed: 0 };
    return {
      id: r.student_id,
      name: name.get(r.student_id) ?? "Student",
      linkedAt: r.created_at,
      assignedCount: c.assigned,
      completedCount: c.completed,
    };
  });
}

// ── All of a tutor's assignments (for the roster review view) ──

export type TutorAssignment = {
  id: string;
  quizId: string;
  quizTitle: string;
  studentId: string;
  status: Assignment["status"];
  assignedAt: string;
};

export async function getTutorAssignments(
  supabase: SupabaseClient,
  tutorId: string,
): Promise<TutorAssignment[]> {
  const { data: assignments, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("tutor_id", tutorId)
    .order("assigned_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (assignments ?? []) as Assignment[];
  if (rows.length === 0) return [];

  const quizIds = [...new Set(rows.map((a) => a.quiz_id))];
  const { data: quizzes } = await supabase.from("quizzes").select("id, title").in("id", quizIds);
  const titleMap = new Map((quizzes ?? []).map((q) => [q.id, q.title as string]));

  return rows.map((a) => ({
    id: a.id,
    quizId: a.quiz_id,
    quizTitle: titleMap.get(a.quiz_id) ?? "Quiz",
    studentId: a.student_id,
    status: a.status,
    assignedAt: a.assigned_at,
  }));
}

// ── A single assignment prepared for tutor review ──

export type AssignmentReview = {
  assignment: Assignment;
  quizTitle: string;
  studentName: string;
  questions: Question[];
  result: (Result & { answers: StoredAnswer[] }) | null;
};

export async function getAssignmentForReview(
  supabase: SupabaseClient,
  assignmentId: string,
  tutorId: string,
): Promise<AssignmentReview | null> {
  const { data: assignment } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", assignmentId)
    .single();
  if (!assignment || assignment.tutor_id !== tutorId) return null;

  const a = assignment as Assignment;

  const [{ data: quiz }, { data: student }] = await Promise.all([
    supabase.from("quizzes").select("*").eq("id", a.quiz_id).single(),
    supabase.from("profiles").select("id, display_name, full_name").eq("id", a.student_id).single(),
  ]);

  // The result: prefer the one the assignment was completed with, else the
  // student's most recent attempt at this quiz.
  let result: Result | null = null;
  if (a.result_id) {
    const { data } = await supabase.from("results").select("*").eq("id", a.result_id).single();
    result = (data as Result) ?? null;
  }
  if (!result) {
    const { data } = await supabase
      .from("results")
      .select("*")
      .eq("quiz_id", a.quiz_id)
      .eq("user_id", a.student_id)
      .order("taken_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    result = (data as Result) ?? null;
  }

  let questions: Question[] = [];
  if (quiz) {
    const { data: qs } = await supabase
      .from("questions")
      .select("*")
      .in("id", (quiz as Quiz).question_ids);
    // Preserve the quiz's question order.
    const byId = new Map(((qs ?? []) as Question[]).map((q) => [q.id, q]));
    questions = (quiz as Quiz).question_ids
      .map((id) => byId.get(id))
      .filter(Boolean) as Question[];
  }

  return {
    assignment: a,
    quizTitle: (quiz as Quiz | null)?.title ?? "Quiz",
    studentName: (student?.full_name || student?.display_name || "Student") as string,
    questions,
    result: result
      ? { ...result, answers: (result.answers ?? []) as StoredAnswer[] }
      : null,
  };
}
