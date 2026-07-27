import { NextRequest, NextResponse } from "next/server";
import { getQuizById, getSubjects, getEnrichedResults } from "@/lib/questions";
import { scoreQuiz, type AnswerRecord, type QuestionMeta } from "@/lib/scoring";
import { getUserReportedQuestionIds } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { checkAchievements, calcBonusXP, type ResultSummary } from "@/lib/achievements";
import { completeSession } from "@/lib/quizSession";
import { streakAfterQuiz } from "@/lib/streak";
import { QuizMode } from "@/types";
import { authUserFrom } from "@/lib/auth";

export async function GET() {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const enriched = await getEnrichedResults(supabase, user.id);
    return NextResponse.json(enriched);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { quizId, answers, timeTaken } = await req.json() as {
      quizId: string;
      answers: AnswerRecord[];
      timeTaken?: number;
    };

    const quiz = await getQuizById(quizId);
    if (!quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

    // Fetch canonical correct answers from the server — client correctness is not
    // trusted. difficulty and subject ride along on the same query: they price the
    // answer and attribute it to a leaderboard, so they must be server-side too.
    const questionIds: string[] = (answers as AnswerRecord[]).map((a) => a.questionId);
    const { data: questionRows } = await supabase
      .from("questions")
      .select("id, correct_answer, difficulty, subject")
      .in("id", questionIds);

    const meta: Record<string, QuestionMeta> = Object.fromEntries(
      (questionRows ?? []).map((q) => [
        q.id,
        { correctAnswer: q.correct_answer, difficulty: q.difficulty, subject: q.subject },
      ])
    );

    // Which of these questions have already paid this user full XP.
    const { data: earnedRows } = await supabase
      .from("user_question_xp")
      .select("question_id")
      .eq("user_id", user.id)
      .in("question_id", questionIds);
    const alreadyEarned = new Set((earnedRows ?? []).map((r) => r.question_id));

    const missingCount = questionIds.filter((id) => !meta[id]).length;
    if (missingCount > 0) {
      console.warn(`scoreQuiz: ${missingCount} submitted question(s) not found in DB — treated as wrong`);
    }

    // A question the user reported and then skipped is excluded from scoring.
    // Decided here, not by the client: scoreQuiz derives `total` from the
    // answers array, so a tampered client could otherwise drop its wrong
    // answers to inflate the score. An unanswered question with NO report from
    // this user stays in the scoring set and is counted wrong, as before.
    const reported = new Set(await getUserReportedQuestionIds(user.id, questionIds));
    const excludedIds = new Set(
      (answers ?? [])
        .filter((a) => a.userAnswer === "" && reported.has(a.questionId))
        .map((a) => a.questionId)
    );
    const scoredAnswers = (answers ?? []).filter((a) => !excludedIds.has(a.questionId));

    const mode: QuizMode = quiz.mode ?? "ordinary";
    const result = scoreQuiz(
      quizId,
      mode,
      scoredAnswers,
      meta,
      alreadyEarned,
      typeof timeTaken === "number" ? timeTaken : undefined
    );

    // Only quizzes over the public pool feed the leaderboards. Self-authored and
    // group quizzes still grant profile XP, but a user who can write the
    // questions must not be able to write their own ranking.
    const leaderboardEligible = (quiz.visibility ?? "shared") === "shared";

    // The submitted answers, stored so an assigning tutor can review exactly
    // what the student chose. Correctness is still computed server-side above.
    const storedAnswers = (answers ?? []).map((a) => ({
      question_id: a.questionId,
      user_answer: a.userAnswer,
    }));

    // Persist server-computed result — never client-supplied correctness data
    const { data: inserted, error: insertError } = await supabase.from("results").insert({
      id: result.id,
      quiz_id: result.quiz_id,
      mode: result.mode,
      score: result.score,
      total_questions: result.total,
      correct: result.correctCount,
      tag_breakdown: result.tag_breakdown,
      wrong_question_ids: result.wrong_question_ids,
      grading_type: result.grading_type,
      taken_at: result.taken_at,
      ...(result.time_taken !== undefined && { time_taken: result.time_taken }),
      user_id: user.id,
      answers: storedAnswers,
      excluded_question_ids: [...excludedIds],
      xp_awarded: result.xp,
      subject: result.subject,
      leaderboard_eligible: leaderboardEligible,
    }).select("xp_awarded").single();
    if (insertError) throw new Error(insertError.message);

    // The results_price trigger (migration 015) recomputes xp_awarded, subject
    // and leaderboard_eligible from server-side truth and writes the novelty
    // ledger, so those are read back rather than trusted from here — what we
    // report is exactly what was stored. scoreQuiz still prices the submission
    // identically; the read-back is what makes a divergence impossible to
    // surface as a wrong number to the user.
    const awardedXP = inserted?.xp_awarded ?? result.xp;

    // If this quiz was assigned to the student, mark the assignment complete.
    // No-op for ordinary self-started quizzes. Best-effort — a failure here
    // must not fail the whole submission.
    const { error: assignmentError } = await supabase
      .from("assignments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        result_id: result.id,
      })
      .eq("student_id", user.id)
      .eq("quiz_id", quizId)
      .eq("status", "assigned");
    if (assignmentError) {
      console.warn("Failed to mark assignment complete:", assignmentError.message);
    }

    // Clear the active quiz session — this quiz is finished. Best-effort.
    try {
      await completeSession(supabase, user.id, quizId);
    } catch (e) {
      console.warn("Failed to complete quiz session:", e);
    }

    // Load profile for streak + XP update
    const { data: profile } = await supabase
      .from("profiles")
      .select("total_xp, current_streak, longest_streak, last_quiz_at")
      .eq("id", user.id)
      .single();

    const updatedStreak = streakAfterQuiz(
      profile?.last_quiz_at ?? null,
      profile?.current_streak ?? 0,
    );
    const updatedLongest = Math.max(profile?.longest_streak ?? 0, updatedStreak);

    // Achievement check — fetch all results for context
    const { data: allResults } = await supabase
      .from("results")
      .select("score, correct, total_questions, taken_at")
      .eq("user_id", user.id)
      .order("taken_at", { ascending: false });

    const { data: unlockedRows } = await supabase
      .from("user_achievements")
      .select("achievement_id")
      .eq("user_id", user.id);

    const alreadyUnlocked = (unlockedRows ?? []).map((r) => r.achievement_id);

    // Achievements label a result by subject name. scoreQuiz already derived the
    // subject from the questions we fetched, so this no longer needs its own
    // round-trip to look up the first question — and a genuinely cross-subject
    // quiz is now reported as "Mixed" instead of being filed under whichever
    // question happened to come first.
    const subjectMap = new Map(getSubjects().map((s) => [s.id, s.name]));
    const latestSubject = result.subject
      ? (subjectMap.get(result.subject) ?? result.subject)
      : "Mixed";

    const resultSummaries: ResultSummary[] = (allResults ?? []).map((r) => ({
      score: r.score,
      correct: r.correct,
      total_questions: r.total_questions,
      taken_at: r.taken_at,
      subject: latestSubject,
    }));

    const ctx = {
      results: resultSummaries,
      latestScore: result.score,
      latestCorrect: result.correctCount,
      latestTotal: result.total,
      latestSubject,
      currentStreak: updatedStreak,
    };
    const newAchievements = checkAchievements(ctx, alreadyUnlocked);
    const achievementXP = calcBonusXP(newAchievements);

    if (newAchievements.length > 0) {
      const rows = newAchievements.map((id) => ({ user_id: user.id, achievement_id: id }));
      await supabase.from("user_achievements").upsert(rows, { onConflict: "user_id,achievement_id" });
    }

    const totalNewXP = awardedXP + achievementXP;
    // Always write the streak: after a lapse it has to come DOWN to 1, and the
    // old code only ever wrote it when it grew.
    await supabase
      .from("profiles")
      .update({
        total_xp: (profile?.total_xp ?? 0) + totalNewXP,
        last_quiz_at: new Date().toISOString(),
        current_streak: updatedStreak,
        longest_streak: updatedLongest,
      })
      .eq("id", user.id);

    return NextResponse.json({
      id: result.id,
      xp: totalNewXP,
      correctCount: result.correctCount,
      total: result.total,
      score: result.score,
      newAchievements,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
