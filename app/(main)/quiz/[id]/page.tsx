import { notFound, redirect } from "next/navigation";
import { getQuizById, getQuestionsByIds } from "@/lib/questions";
import { getOpenReportedQuestionIds } from "@/lib/reports";
import { shuffleOptions } from "@/lib/shuffleOptions";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { startOrResumeSession } from "@/lib/quizSession";
import QuizSession from "./QuizSession";
import type { Question, Quiz } from "@/types";

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const quiz = await getQuizById(id);
  if (!quiz) notFound();

  // Fetch only this quiz's questions by id (cap-safe), then re-order to match
  // question_ids — the .in() result order is not guaranteed.
  const fetched = await getQuestionsByIds((quiz as Quiz).question_ids);
  const byId = new Map(fetched.map((q) => [q.id, q]));
  const questions = (quiz as Quiz).question_ids
    .map((qid) => byId.get(qid))
    .filter(Boolean) as Question[];

  if (questions.length === 0) notFound();

  const shuffledQuestions = questions.map((q) => ({
    ...q,
    options: shuffleOptions(q.options, `${id}:${q.id}`) as [string, string, string, string],
  }));

  // Ensure this quiz is the user's active session and hydrate resume progress.
  // Creates a session on a direct URL hit. If a DIFFERENT quiz is already
  // active, don't silently hijack it — send the user to My Quizzes where they
  // can resume or exit the active one.
  let initialProgress = {
    currentIndex: 0,
    answers: Array(shuffledQuestions.length).fill(null) as (number | null)[],
  };
  // Questions the user already has an open report on — so a refresh doesn't
  // re-offer the report form for one they've already flagged.
  let initialReportedIds: string[] = [];
  const user = await getUser();
  if (user) {
    const supabase = await createClient();
    const start = await startOrResumeSession(supabase, user.id, id);
    if (!start.ok) redirect("/my-quizzes");

    const saved = Array.isArray(start.session.answers) ? start.session.answers : [];
    initialProgress = {
      currentIndex: Math.min(
        Math.max(start.session.current_index, 0),
        shuffledQuestions.length - 1,
      ),
      answers: Array.from({ length: shuffledQuestions.length }, (_, i) => saved[i] ?? null),
    };

    initialReportedIds = await getOpenReportedQuestionIds(
      user.id,
      shuffledQuestions.map((q) => q.id),
    );
  }

  return (
    <QuizSession
      quiz={quiz as Quiz}
      questions={shuffledQuestions}
      initialProgress={initialProgress}
      initialReportedIds={initialReportedIds}
    />
  );
}
