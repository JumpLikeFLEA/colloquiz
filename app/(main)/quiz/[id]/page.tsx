import { notFound, redirect } from "next/navigation";
import { getQuizById, getQuestionsByIds } from "@/lib/questions";
import { getOpenReportedQuestionIds } from "@/lib/reports";
import { shuffleOptions } from "@/lib/shuffleOptions";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { startOrResumeSession } from "@/lib/quizSession";
import { answerOptions } from "@/lib/options";
import QuizSession from "./QuizSession";
import type { PlayableQuestion, Question, Quiz } from "@/types";

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

  // Drop the empty padding slots of the stored 4-tuple before shuffling, so a
  // true/false question offers two answers rather than two blank cards.
  const shuffledQuestions: PlayableQuestion[] = questions.map((q) => ({
    ...q,
    options: shuffleOptions(answerOptions(q.options), `${id}:${q.id}`),
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
  // The session's start time drives the on-screen timer. Resuming keeps the
  // original started_at, so the clock reflects the whole run, not this visit.
  // Signed-out users have no session: time this page view instead.
  let startedAt = new Date().toISOString();
  const user = await getUser();
  if (user) {
    const supabase = await createClient();
    const start = await startOrResumeSession(supabase, user.id, id);
    if (!start.ok) redirect("/my-quizzes");
    startedAt = start.session.started_at;

    const saved = Array.isArray(start.session.answers) ? start.session.answers : [];
    initialProgress = {
      currentIndex: Math.min(
        Math.max(start.session.current_index, 0),
        shuffledQuestions.length - 1,
      ),
      // Answers are option indices. Discard any that no longer address an
      // option — a session started before the empty slots were dropped can hold
      // an index past the end of its (now shorter) list.
      answers: Array.from({ length: shuffledQuestions.length }, (_, i) => {
        const a = saved[i];
        return typeof a === "number" && a >= 0 && a < shuffledQuestions[i].options.length
          ? a
          : null;
      }),
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
      startedAt={startedAt}
    />
  );
}
