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
  let questions = (quiz as Quiz).question_ids
    .map((qid) => byId.get(qid))
    .filter(Boolean) as Question[];

  // A group quiz stays playable while its members are still drafting, so it
  // can hold questions that haven't passed the group's review yet. Serve only
  // the approved ones — the group page shows both counts ("5 questions ·
  // 3 approved") so the shorter run isn't a surprise. Scoped to group quizzes
  // so the solo submit-to-pool flow, where an author plays their own quiz
  // while a question sits in admin review, is unaffected.
  if ((quiz as Quiz).group_id) {
    questions = questions.filter((q) => q.status === "approved");
  }

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
  // Populated only when this quiz is an active duel leg for the current user;
  // drives the in-quiz "Duel vs X" banner + countdown and the results banner.
  let duel: {
    duelId: string;
    opponentName: string;
    startedAt: string;
    timeLimitSeconds: number;
  } | null = null;
  const user = await getUser();
  if (user) {
    const supabase = await createClient();
    const start = await startOrResumeSession(supabase, user.id, id);
    if (!start.ok) redirect("/my-quizzes");
    startedAt = start.session.started_at;

    // If this quiz is a duel leg, the duel's server-side clock starts HERE —
    // only once the session is confirmed. Starting it back on the "Play" button
    // would run the timer while a player with another quiz already active sits
    // on the redirect above, and could time them out of a duel they never saw.
    // start_duel_leg is idempotent, so resuming does not restart the clock, and
    // it is a no-op for an ordinary quiz. It now returns the duel context (or
    // { is_duel: false }) so the quiz can show the banner and countdown without
    // a second round-trip.
    const { data: legData } = await supabase.rpc("start_duel_leg_for_quiz", {
      p_quiz_id: id,
    });
    const leg = legData as {
      is_duel?: boolean;
      duel_id?: string;
      opponent_name?: string;
      started_at?: string;
      time_limit_seconds?: number;
    } | null;
    if (leg?.is_duel && leg.duel_id && leg.started_at) {
      duel = {
        duelId: leg.duel_id,
        opponentName: leg.opponent_name ?? "your opponent",
        startedAt: leg.started_at,
        timeLimitSeconds: leg.time_limit_seconds ?? 900,
      };
    }

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

  // "Share with a friend" is offered only for public-bank quizzes (Quick Play):
  // visibility='shared', not a group quiz, not a duel leg — so every question is
  // approved+shared and readable by any friend. Signed-out players can't share.
  const q = quiz as Quiz;
  const shareable = !!user && q.visibility === "shared" && !q.group_id && !duel;

  return (
    <QuizSession
      quiz={quiz as Quiz}
      questions={shuffledQuestions}
      initialProgress={initialProgress}
      initialReportedIds={initialReportedIds}
      startedAt={startedAt}
      duel={duel}
      shareable={shareable}
    />
  );
}
