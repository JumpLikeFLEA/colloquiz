import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthor, buildQuestionRows, type IncomingQuestion } from "@/lib/authorQuiz";
import type { Quiz, Question, Difficulty, QuizMode } from "@/types";

type RequestBody = {
  title: string;
  subject: string;
  mode: QuizMode;
  difficulty: Difficulty | "mixed";
  questions: IncomingQuestion[];
};

async function loadOwnedPrivateQuiz(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quizId: string,
  userId: string,
): Promise<Quiz | null> {
  const { data } = await supabase.from("quizzes").select("*").eq("id", quizId).single();
  const quiz = data as Quiz | null;
  if (!quiz || quiz.created_by !== userId || quiz.visibility !== "private") return null;
  return quiz;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthor(supabase);
    if (auth.error) return auth.error;
    const { user } = auth;
    const { id } = await params;

    const quiz = await loadOwnedPrivateQuiz(supabase, id, user.id);
    if (!quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

    const body: RequestBody = await req.json();
    if (!body.title?.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!Array.isArray(body.questions) || body.questions.length === 0) {
      return NextResponse.json({ error: "at least one question is required" }, { status: 400 });
    }

    // A question submitted to the shared pool is out of the author's hands
    // (it's in admin review). Editing the quiz would orphan or mutate it, so
    // block editing once any question has been shared.
    const { data: existing } = await supabase
      .from("questions")
      .select("id, visibility")
      .in("id", quiz.question_ids);
    const rows = (existing ?? []) as Pick<Question, "id" | "visibility">[];
    if (rows.some((q) => q.visibility === "shared")) {
      return NextResponse.json(
        { error: "This quiz has questions submitted to the shared pool and can no longer be edited." },
        { status: 409 },
      );
    }

    // Replace the private question set wholesale.
    if (rows.length > 0) {
      const { error: delErr } = await supabase
        .from("questions")
        .delete()
        .in("id", rows.map((q) => q.id));
      if (delErr) throw new Error(delErr.message);
    }

    const newQuestions = buildQuestionRows(body.questions, body.subject, user.id);
    const { error: insErr } = await supabase.from("questions").insert(
      newQuestions.map((q) => ({ ...q, created_by: user.id })),
    );
    if (insErr) throw new Error(insErr.message);

    const { error: updErr } = await supabase
      .from("quizzes")
      .update({
        title: body.title.trim(),
        tags: [...new Set(newQuestions.flatMap((q) => q.tags))],
        difficulty_mix: body.difficulty,
        question_ids: newQuestions.map((q) => q.id),
        mode: body.mode,
      })
      .eq("id", id);
    if (updErr) throw new Error(updErr.message);

    return NextResponse.json({ quizId: id, questionCount: newQuestions.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthor(supabase);
    if (auth.error) return auth.error;
    const { user } = auth;
    const { id } = await params;

    const quiz = await loadOwnedPrivateQuiz(supabase, id, user.id);
    if (!quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

    // results.quiz_id has no cascade — a delete would fail once anyone has
    // taken it. Surface that clearly instead of a 500.
    const { count } = await supabase
      .from("results")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", id);
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: "This quiz has recorded attempts and can't be deleted." },
        { status: 409 },
      );
    }

    // Assignments cascade via FK. Delete the quiz, then its private questions.
    const { error: delQuizErr } = await supabase.from("quizzes").delete().eq("id", id);
    if (delQuizErr) throw new Error(delQuizErr.message);

    await supabase
      .from("questions")
      .delete()
      .in("id", quiz.question_ids)
      .eq("created_by", user.id)
      .eq("visibility", "private");

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
