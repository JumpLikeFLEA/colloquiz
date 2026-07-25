import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyAssignments, getMyCreatedQuizzes, getLinkedStudents } from "@/lib/author";
import { getActiveSessionSummary } from "@/lib/quizSession";
import { getUser, getProfile } from "@/lib/supabase/queries";
import { MyQuizzesView } from "./MyQuizzesView";

export default async function MyQuizzesPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const profile = await getProfile();
  const isAuthor = !!profile?.is_author || profile?.role === "admin";

  const [assignments, created, students, active, shares] = await Promise.all([
    getMyAssignments(supabase, user.id),
    isAuthor ? getMyCreatedQuizzes(supabase, user.id) : Promise.resolve([]),
    isAuthor ? getLinkedStudents(supabase, user.id) : Promise.resolve([]),
    getActiveSessionSummary(supabase, user.id),
    getMyQuizShares(supabase),
  ]);

  return (
    <MyQuizzesView
      isAuthor={isAuthor}
      assignments={assignments}
      created={created}
      students={students}
      active={active}
      shares={shares}
    />
  );
}

export type QuizShareRow = { token: string; title: string; questionCount: number };

// The caller's active shares (quiz_shares owner-read RLS scopes this to them),
// joined to their snapshot quiz for title + question count. Powers the "Shared"
// list where a sharer copies the link again or stops sharing.
async function getMyQuizShares(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<QuizShareRow[]> {
  const { data: rows } = await supabase
    .from("quiz_shares")
    .select("token, snapshot_quiz_id, created_at")
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (!rows || rows.length === 0) return [];

  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("id, title, question_ids")
    .in("id", rows.map((r) => r.snapshot_quiz_id));

  const byId = new Map((quizzes ?? []).map((q) => [q.id, q]));
  return rows.map((r) => {
    const q = byId.get(r.snapshot_quiz_id);
    return {
      token: r.token as string,
      title: (q?.title as string) ?? "Shared quiz",
      questionCount: Array.isArray(q?.question_ids) ? q!.question_ids.length : 0,
    };
  });
}
