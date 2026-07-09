import { NextRequest, NextResponse } from "next/server";
import { getQuizById, getSubjects, getEnrichedResults } from "@/lib/questions";
import { scoreQuiz, type AnswerRecord } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";
import { checkAchievements, calcBonusXP, type ResultSummary } from "@/lib/achievements";
import { QuizMode } from "@/types";

function calcStreak(lastQuizAt: string | null): {
  newStreak: number;
  streakChanged: boolean;
} {
  if (!lastQuizAt) return { newStreak: 1, streakChanged: true };

  const lastDate = new Date(lastQuizAt).toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  if (lastDate === today) return { newStreak: 0, streakChanged: false };
  if (lastDate === yesterday) return { newStreak: 1, streakChanged: true };
  return { newStreak: 1, streakChanged: true };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { quizId, answers, timeTaken } = await req.json() as {
      quizId: string;
      answers: AnswerRecord[];
      timeTaken?: number;
    };

    const quiz = await getQuizById(quizId);
    if (!quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

    // Fetch canonical correct answers from the server — client correctness is not trusted
    const questionIds: string[] = (answers as AnswerRecord[]).map((a) => a.questionId);
    const { data: questionRows } = await supabase
      .from("questions")
      .select("id, correct_answer")
      .in("id", questionIds);

    const correctAnswers: Record<string, string> = Object.fromEntries(
      (questionRows ?? []).map((q) => [q.id, q.correct_answer])
    );

    const missingCount = questionIds.filter((id) => !correctAnswers[id]).length;
    if (missingCount > 0) {
      console.warn(`scoreQuiz: ${missingCount} submitted question(s) not found in DB — treated as wrong`);
    }

    const mode: QuizMode = quiz.mode ?? "ordinary";
    const result = scoreQuiz(
      quizId,
      mode,
      answers,
      correctAnswers,
      typeof timeTaken === "number" ? timeTaken : undefined
    );

    // The submitted answers, stored so an assigning tutor can review exactly
    // what the student chose. Correctness is still computed server-side above.
    const storedAnswers = (answers ?? []).map((a) => ({
      question_id: a.questionId,
      user_answer: a.userAnswer,
    }));

    // Persist server-computed result — never client-supplied correctness data
    const { error: insertError } = await supabase.from("results").insert({
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
    });
    if (insertError) throw new Error(insertError.message);

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

    // Load profile for streak + XP update
    const { data: profile } = await supabase
      .from("profiles")
      .select("total_xp, current_streak, longest_streak, last_quiz_at")
      .eq("id", user.id)
      .single();

    const { newStreak, streakChanged } = calcStreak(profile?.last_quiz_at ?? null);
    const updatedStreak = streakChanged
      ? (profile?.current_streak ?? 0) + newStreak
      : profile?.current_streak ?? 0;
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

    const subjects = getSubjects();
    const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
    const { data: firstQRow } = await supabase
      .from("questions")
      .select("subject")
      .eq("id", quiz.question_ids[0])
      .single();
    const latestSubject = firstQRow?.subject
      ? (subjectMap.get(firstQRow.subject) ?? firstQRow.subject)
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

    const totalNewXP = result.xp + achievementXP;
    const profileUpdate: Record<string, unknown> = {
      total_xp: (profile?.total_xp ?? 0) + totalNewXP,
      last_quiz_at: new Date().toISOString(),
    };
    if (streakChanged) {
      profileUpdate.current_streak = updatedStreak;
      profileUpdate.longest_streak = updatedLongest;
    }
    await supabase.from("profiles").update(profileUpdate).eq("id", user.id);

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
