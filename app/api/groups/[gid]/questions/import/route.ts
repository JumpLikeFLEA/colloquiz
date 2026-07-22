import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireGroupMember, loadGroupQuiz, syncQuizTags } from "@/lib/groups";
import { generateId } from "@/lib/authorQuiz";
import type { Question } from "@/types";

// POST { quizId, questionIds } → COPY existing questions into a group quiz.
//
// Two sources are allowed: the public approved pool, and the caller's own
// private questions.
//
// This is always a copy, never a move. Flipping the source row in place would
// be tidier, but the author's own private quizzes still reference that id, so
// re-pointing it at the group would silently expose the contents of those
// quizzes to every group member, with no undo. A copy leaves the original
// untouched and is reversible by deleting it.
export async function POST(req: NextRequest, { params }: { params: Promise<{ gid: string }> }) {
  try {
    const supabase = await createClient();
    const { gid } = await params;
    const auth = await requireGroupMember(supabase, gid);
    if (auth.error) return auth.error;
    const { user } = auth;

    const body = (await req.json()) as { quizId?: string; questionIds?: string[] };
    if (!body.quizId) return NextResponse.json({ error: "quizId is required" }, { status: 400 });
    if (!Array.isArray(body.questionIds) || body.questionIds.length === 0) {
      return NextResponse.json({ error: "questionIds is required" }, { status: 400 });
    }

    const quiz = await loadGroupQuiz(supabase, body.quizId, gid);
    if (!quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

    const { data: sources, error: srcErr } = await supabase
      .from("questions")
      .select("*")
      .in("id", body.questionIds);
    if (srcErr) throw new Error(srcErr.message);

    // Re-check eligibility server-side. RLS already hides anything the caller
    // can't read, but it would still permit reading another member's *group*
    // question, which is not an importable source.
    const eligible = ((sources ?? []) as Question[]).filter(
      (q) =>
        (q.visibility === "shared" && q.status === "approved") ||
        (q.visibility === "private" && q.created_by === user.id),
    );
    if (eligible.length === 0) {
      return NextResponse.json(
        { error: "None of those questions can be imported." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const copies = eligible.map((q) => ({
      id: generateId("q"),
      type: q.type,
      subject: q.subject,
      tags: q.tags ?? [],
      difficulty: q.difficulty,
      question: q.question,
      options: q.options,
      correct_answer: q.correct_answer,
      explanation: q.explanation ?? "",
      created_at: now,
      source: q.source,
      // The group copy is owned by whoever imported it. It cannot keep the
      // original author's id: the "questions: group member insert" policy
      // requires created_by = auth.uid(), and a member may only vouch for
      // rows they are inserting. For a self-import this is a no-op, since
      // the caller is already the author.
      created_by: user.id,
      // Imported rows enter the group's queue like any other draft — the
      // group decides what belongs in its quiz, independently of whether the
      // question was already approved elsewhere.
      status: "pending" as const,
      visibility: "group" as const,
      group_id: gid,
    }));

    const { error: insErr } = await supabase.from("questions").insert(copies);
    if (insErr) throw new Error(insErr.message);

    const { error: updErr } = await supabase
      .from("quizzes")
      .update({ question_ids: [...quiz.question_ids, ...copies.map((c) => c.id)] })
      .eq("id", quiz.id);
    if (updErr) throw new Error(updErr.message);

    await syncQuizTags(supabase, quiz.id);

    return NextResponse.json({ imported: copies.length, questions: copies });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
