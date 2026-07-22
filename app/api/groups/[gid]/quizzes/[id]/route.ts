import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireGroupMember, loadGroupQuiz } from "@/lib/groups";
import type { Difficulty, QuizMode } from "@/types";

// PATCH { title?, mode?, difficulty?, questionIds? } → quiz metadata and
// ordering only.
//
// Crucially this NEVER touches question rows. `questionIds` may only reorder
// the quiz's existing set — any id not already on the quiz is rejected, so a
// reorder can't smuggle in a question or silently drop one. Removing a
// question is DELETE /api/groups/[gid]/questions/[qid].
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ gid: string; id: string }> },
) {
  try {
    const supabase = await createClient();
    const { gid, id } = await params;
    const auth = await requireGroupMember(supabase, gid);
    if (auth.error) return auth.error;

    const quiz = await loadGroupQuiz(supabase, id, gid);
    if (!quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

    const body = (await req.json()) as {
      title?: string;
      mode?: QuizMode;
      difficulty?: Difficulty | "mixed";
      questionIds?: string[];
    };

    const update: Record<string, unknown> = {};
    if (body.title !== undefined) {
      if (!body.title.trim()) {
        return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
      }
      update.title = body.title.trim();
    }
    if (body.mode !== undefined) update.mode = body.mode;
    if (body.difficulty !== undefined) update.difficulty_mix = body.difficulty;

    if (body.questionIds !== undefined) {
      const current = [...quiz.question_ids].sort();
      const next = [...body.questionIds].sort();
      const sameSet =
        current.length === next.length && current.every((qid, i) => qid === next[i]);
      if (!sameSet) {
        return NextResponse.json(
          { error: "questionIds may only reorder the quiz's existing questions." },
          { status: 400 },
        );
      }
      update.question_ids = body.questionIds;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { error } = await supabase.from("quizzes").update(update).eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE → remove the quiz and its group-owned questions.
//
// Mirrors the solo author DELETE: results, sessions and assignments cascade
// off quizzes via migration 012, so every recorded attempt goes with it.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ gid: string; id: string }> },
) {
  try {
    const supabase = await createClient();
    const { gid, id } = await params;
    const auth = await requireGroupMember(supabase, gid);
    if (auth.error) return auth.error;

    const quiz = await loadGroupQuiz(supabase, id, gid);
    if (!quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

    const { error: delQuizErr } = await supabase.from("quizzes").delete().eq("id", id);
    if (delQuizErr) throw new Error(delQuizErr.message);

    // Only this group's own questions. A pool question the quiz merely
    // referenced is left alone — the quiz held a copy's id, not the pool row.
    if (quiz.question_ids.length > 0) {
      await supabase
        .from("questions")
        .delete()
        .in("id", quiz.question_ids)
        .eq("group_id", gid)
        .eq("visibility", "group");
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
