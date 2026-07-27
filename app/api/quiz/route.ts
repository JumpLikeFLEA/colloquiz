import { NextRequest, NextResponse } from "next/server";
import { sampleQuestions, saveQuiz, getSubjects } from "@/lib/questions";
import { createClient } from "@/lib/supabase/server";
import { QuizFilter, Difficulty, QuizSize, QuizMode } from "@/types";
import { v4 as uuidv4 } from "uuid";
import { authUserFrom } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const filter: QuizFilter = {
      tags: Array.isArray(body.tags) ? body.tags : [],
      difficulty: (body.difficulty as Difficulty | "mixed") ?? "mixed",
      size: (body.size as QuizSize) ?? 10,
      mode: (body.mode as QuizMode) ?? "ordinary",
      subject: body.subject,
    };

    const questions = await sampleQuestions(filter);
    if (questions.length === 0) {
      return NextResponse.json(
        { error: "No questions found for the selected filters. Try broadening your selection." },
        { status: 400 }
      );
    }

    // Name the quiz after its subject rather than the generic word "Quiz" —
    // this title is what the resume banner and My Quizzes show. Taken from the
    // sampled questions, not the requested filter, since a tag-only or custom
    // selection has no subject on it. Several subjects in the mix → "Mixed".
    const subjectIds = new Set(questions.map((q) => q.subject));
    const subjectLabel =
      subjectIds.size === 1
        ? (getSubjects().find((s) => s.id === [...subjectIds][0])?.name ?? "Quiz")
        : "Mixed";

    const quiz = {
      id: uuidv4(),
      title: `${subjectLabel} — ${new Date().toLocaleString()}`,
      tags: filter.tags,
      difficulty_mix: filter.difficulty,
      mode: filter.mode,
      question_ids: questions.map((q) => q.id),
      created_at: new Date().toISOString(),
    };

    await saveQuiz(quiz, user.id);

    return NextResponse.json({ id: quiz.id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
