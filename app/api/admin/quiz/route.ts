import { NextRequest, NextResponse } from "next/server";
import { saveQuestions, saveQuiz } from "@/lib/questions";
import { createClient } from "@/lib/supabase/server";
import { Question, Quiz, Difficulty, QuizMode } from "@/types";
import { authUserFrom } from "@/lib/auth";

type IncomingQuestion = {
  question: string;
  type: "multiple_choice" | "true_false";
  options: [string, string, string, string];
  correct_answer: string;
  explanation: string;
  difficulty: Difficulty;
  tags: string[];
};

type RequestBody = {
  title: string;
  subject: string;
  mode: QuizMode;
  difficulty: Difficulty | "mixed";
  questions: IncomingQuestion[];
};

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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

    const now = new Date().toISOString();

    const newQuestions: Question[] = body.questions.map((q) => {
      const options: [string, string, string, string] =
        q.type === "true_false" ? ["True", "False", "", ""] : q.options;

      return {
        id: generateId("q"),
        type: "multiple_choice",
        subject: body.subject,
        tags: q.tags ?? [],
        difficulty: q.difficulty,
        question: q.question,
        options,
        correct_answer: q.correct_answer,
        explanation: q.explanation ?? "",
        created_at: now,
        source: "manual" as const,
        created_by: user.id,
        status: "pending" as const,
      };
    });

    await saveQuestions(newQuestions, user.id);

    const quiz: Quiz = {
      id: generateId("quiz"),
      title: body.title,
      tags: [...new Set(newQuestions.flatMap((q) => q.tags))],
      difficulty_mix: body.difficulty,
      question_ids: newQuestions.map((q) => q.id),
      created_at: now,
      mode: body.mode,
      created_by: user.id,
    };

    await saveQuiz(quiz, user.id);

    return NextResponse.json({ quizId: quiz.id, questionCount: newQuestions.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
