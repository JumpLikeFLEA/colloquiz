import { NextRequest, NextResponse } from "next/server";
import { saveQuestions, saveQuiz } from "@/lib/questions";
import { createClient } from "@/lib/supabase/server";
import { requireAuthor, buildQuestionRows, generateId, type IncomingQuestion } from "@/lib/authorQuiz";
import { Quiz, Difficulty, QuizMode } from "@/types";

type RequestBody = {
  title: string;
  subject: string;
  mode: QuizMode;
  difficulty: Difficulty | "mixed";
  questions: IncomingQuestion[];
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthor(supabase);
    if (auth.error) return auth.error;
    const { user } = auth;

    const body: RequestBody = await req.json();

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!body.subject?.trim()) {
      return NextResponse.json({ error: "subject is required" }, { status: 400 });
    }
    if (!Array.isArray(body.questions) || body.questions.length === 0) {
      return NextResponse.json({ error: "at least one question is required" }, { status: 400 });
    }

    const newQuestions = buildQuestionRows(body.questions, body.subject, user.id);
    await saveQuestions(newQuestions, user.id);

    const quiz: Quiz = {
      id: generateId("quiz"),
      title: body.title,
      tags: [...new Set(newQuestions.flatMap((q) => q.tags))],
      difficulty_mix: body.difficulty,
      question_ids: newQuestions.map((q) => q.id),
      created_at: new Date().toISOString(),
      mode: body.mode,
      created_by: user.id,
      visibility: "private",
    };
    await saveQuiz(quiz, user.id);

    return NextResponse.json({ quizId: quiz.id, questionCount: newQuestions.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
