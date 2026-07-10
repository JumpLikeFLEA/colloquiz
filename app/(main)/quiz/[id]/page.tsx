import { notFound, redirect } from "next/navigation";
import { getQuizById, getQuestions } from "@/lib/questions";
import { shuffleOptions } from "@/lib/shuffleOptions";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { startOrResumeSession } from "@/lib/quizSession";
import QuizSession from "./QuizSession";
import type { Question, Quiz } from "@/types";

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [quiz, allQuestions] = await Promise.all([getQuizById(id), getQuestions()]);
  if (!quiz) notFound();

  const questions = (quiz as Quiz).question_ids
    .map((qid) => (allQuestions as Question[]).find((q) => q.id === qid))
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
  }

  return (
    <QuizSession
      quiz={quiz as Quiz}
      questions={shuffledQuestions}
      initialProgress={initialProgress}
    />
  );
}
