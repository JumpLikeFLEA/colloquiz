import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireGroupMember, loadGroupQuiz, syncQuizTags } from "@/lib/groups";
import { validateIncomingQuestion, type IncomingQuestion } from "@/lib/authorQuiz";
import type { Question } from "@/types";

async function loadGroupQuestion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  questionId: string,
  groupId: string,
): Promise<Question | null> {
  const { data } = await supabase.from("questions").select("*").eq("id", questionId).maybeSingle();
  const q = data as Question | null;
  if (!q || q.group_id !== groupId || q.visibility !== "group") return null;
  return q;
}

// PATCH → edit ONE question in place. The row keeps its id, so review status
// survives the edit, concurrent edits to *different* questions never collide,
// and the question ids recorded in past results stay resolvable.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ gid: string; qid: string }> },
) {
  try {
    const supabase = await createClient();
    const { gid, qid } = await params;
    const auth = await requireGroupMember(supabase, gid);
    if (auth.error) return auth.error;

    const existing = await loadGroupQuestion(supabase, qid, gid);
    if (!existing) return NextResponse.json({ error: "Question not found" }, { status: 404 });

    const body = (await req.json()) as { subject?: string; question?: IncomingQuestion };
    const incoming = body.question as IncomingQuestion;
    const invalid = validateIncomingQuestion(incoming);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const options: [string, string, string, string] =
      incoming.type === "true_false" ? ["True", "False", "", ""] : incoming.options;

    // Editing an already-reviewed question sends it back through review: the
    // approval applied to the old text, not this one. Note the guard trigger
    // permits this transition — it only restricts pending → approved/rejected.
    const update: Record<string, unknown> = {
      question: incoming.question,
      options,
      correct_answer: incoming.correct_answer,
      explanation: incoming.explanation ?? "",
      difficulty: incoming.difficulty,
      tags: incoming.tags ?? [],
      status: "pending",
      reviewed_by: null,
      reviewed_at: null,
    };
    if (body.subject?.trim()) update.subject = body.subject.trim();

    const { data: updated, error } = await supabase
      .from("questions")
      .update(update)
      .eq("id", qid)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) return NextResponse.json({ error: "Question not found" }, { status: 404 });

    const { quizId } = (body as { quizId?: string }) ?? {};
    if (quizId) {
      const quiz = await loadGroupQuiz(supabase, quizId, gid);
      if (quiz) await syncQuizTags(supabase, quiz.id);
    }

    return NextResponse.json({ question: updated as Question });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE → remove ONE question and unlink it from its quiz. Only the deleted
// id is pulled out of question_ids; every other question keeps its id and
// position.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ gid: string; qid: string }> },
) {
  try {
    const supabase = await createClient();
    const { gid, qid } = await params;
    const auth = await requireGroupMember(supabase, gid);
    if (auth.error) return auth.error;

    const existing = await loadGroupQuestion(supabase, qid, gid);
    if (!existing) return NextResponse.json({ error: "Question not found" }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) as { quizId?: string };

    if (body.quizId) {
      const quiz = await loadGroupQuiz(supabase, body.quizId, gid);
      if (quiz) {
        const { error: updErr } = await supabase
          .from("quizzes")
          .update({ question_ids: quiz.question_ids.filter((id) => id !== qid) })
          .eq("id", quiz.id);
        if (updErr) throw new Error(updErr.message);
      }
    }

    const { error } = await supabase.from("questions").delete().eq("id", qid);
    if (error) throw new Error(error.message);

    if (body.quizId) await syncQuizTags(supabase, body.quizId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
