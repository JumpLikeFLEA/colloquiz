import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireGroupMember, loadGroupQuiz, syncQuizTags } from "@/lib/groups";
import { buildQuestionRows, validateIncomingQuestion, type IncomingQuestion } from "@/lib/authorQuiz";
import type { Question } from "@/types";

// POST { quizId, subject, question } → append ONE question to a group quiz.
//
// Deliberately not modelled on PATCH /api/author/quiz/[id], which deletes and
// reinserts the entire question set on every save. That is unsafe here: two
// members saving concurrently would clobber each other, and regenerating ids
// would reset each question's review status and orphan the question ids
// recorded in past results.
export async function POST(req: NextRequest, { params }: { params: Promise<{ gid: string }> }) {
  try {
    const supabase = await createClient();
    const { gid } = await params;
    const auth = await requireGroupMember(supabase, gid);
    if (auth.error) return auth.error;
    const { user } = auth;

    const body = (await req.json()) as {
      quizId?: string;
      subject?: string;
      question?: IncomingQuestion;
    };
    if (!body.quizId) return NextResponse.json({ error: "quizId is required" }, { status: 400 });
    if (!body.subject?.trim()) {
      return NextResponse.json({ error: "subject is required" }, { status: 400 });
    }

    const invalid = validateIncomingQuestion(body.question as IncomingQuestion);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const quiz = await loadGroupQuiz(supabase, body.quizId, gid);
    if (!quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

    // buildQuestionRows with a groupId emits visibility 'group', the group_id,
    // and status 'pending' — a member can't vouch for their own draft.
    const [row] = buildQuestionRows(
      [body.question as IncomingQuestion],
      body.subject,
      user.id,
      gid,
    );

    const { error: insErr } = await supabase.from("questions").insert(row);
    if (insErr) throw new Error(insErr.message);

    const { error: updErr } = await supabase
      .from("quizzes")
      .update({ question_ids: [...quiz.question_ids, row.id] })
      .eq("id", quiz.id);
    if (updErr) throw new Error(updErr.message);

    await syncQuizTags(supabase, quiz.id);

    return NextResponse.json({ question: row as Question });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
