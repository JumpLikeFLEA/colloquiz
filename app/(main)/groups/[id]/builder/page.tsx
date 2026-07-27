import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { getGroup, loadGroupQuiz } from "@/lib/groups";
import { getSubjects } from "@/lib/questions";
import { GroupBuilderView } from "./GroupBuilderView";
import type { Question } from "@/types";

export default async function GroupBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ quiz?: string }>;
}) {
  const { id } = await params;
  const { quiz: quizId } = await searchParams;

  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/login");

  const detail = await getGroup(supabase, id, user.id);
  if (!detail) notFound();
  if (!quizId) redirect(`/groups/${id}`);

  const quiz = await loadGroupQuiz(supabase, quizId, id);
  if (!quiz) notFound();

  // Group members can read the group's pending questions, so the builder sees
  // drafts awaiting review as well as approved ones.
  const { data: rows } = quiz.question_ids.length
    ? await supabase.from("questions").select("*").in("id", quiz.question_ids)
    : { data: [] };

  const byId = new Map(((rows ?? []) as Question[]).map((q) => [q.id, q]));
  const questions = quiz.question_ids.map((qid) => byId.get(qid)).filter(Boolean) as Question[];

  return (
    <GroupBuilderView
      groupId={id}
      groupName={detail.group.name}
      quiz={quiz}
      initialQuestions={questions}
      subjects={getSubjects().map((s) => ({ id: s.id, name: s.name }))}
      userId={user.id}
    />
  );
}
