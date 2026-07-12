import { createClient } from "@/lib/supabase/server";
import type { Question, QuestionReport, ReportedQuestionGroup } from "@/types";

// Which of these questions the user already has an OPEN report on. Used to
// hydrate the quiz UI so a page refresh doesn't re-offer the report form for a
// question they already reported (the DB blocks the duplicate anyway, but the
// user shouldn't have to fill the form to find that out). Reads via the
// "question_reports: reporter read own" RLS policy.
// Resolved reports are excluded on purpose — once an admin has acted, the user
// is allowed to report the question again.
export async function getOpenReportedQuestionIds(
  userId: string,
  questionIds: string[],
): Promise<string[]> {
  if (questionIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question_reports")
    .select("question_id")
    .eq("user_id", userId)
    .eq("status", "open")
    .in("question_id", questionIds);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.question_id as string);
}

// Which of these questions the user has reported at all — ANY status. Used at
// scoring time to decide whether an unanswered question was a legitimate skip.
// Deliberately unfiltered by status, unlike getOpenReportedQuestionIds: if an
// admin resolves the report while the quiz is still in progress, the user's
// skip must not suddenly be re-scored as a wrong answer.
export async function getUserReportedQuestionIds(
  userId: string,
  questionIds: string[],
): Promise<string[]> {
  if (questionIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question_reports")
    .select("question_id")
    .eq("user_id", userId)
    .in("question_id", questionIds);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.question_id as string);
}

// Admin-only. Fetches all OPEN reports (embedding each question) and groups
// them by question, most-reported first. Admins can read every question via
// the "questions: admin read all" RLS policy, so questions that were rejected
// or edited between report and review still resolve here.
export async function getReportedQuestions(): Promise<ReportedQuestionGroup[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question_reports")
    .select("*, question:questions(*)")
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);

  type Row = QuestionReport & { question: Question | null };
  const groups = new Map<string, ReportedQuestionGroup>();
  for (const row of (data ?? []) as Row[]) {
    const { question, ...report } = row;
    if (!question) continue; // question hard-deleted — nothing to moderate
    const existing = groups.get(report.question_id);
    if (existing) existing.reports.push(report);
    else groups.set(report.question_id, { question, reports: [report] });
  }

  return [...groups.values()].sort((a, b) => b.reports.length - a.reports.length);
}
