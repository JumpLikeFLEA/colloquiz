import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireGroupMember } from "@/lib/groups";
import { generateId } from "@/lib/authorQuiz";
import type { Difficulty, Quiz, QuizMode } from "@/types";

// POST { title, mode?, difficulty? } → create an empty group quiz.
//
// Questions are added afterwards one at a time via
// POST /api/groups/[gid]/questions, so the quiz starts with no questions
// rather than being submitted whole.
export async function POST(req: NextRequest, { params }: { params: Promise<{ gid: string }> }) {
  try {
    const supabase = await createClient();
    const { gid } = await params;
    const auth = await requireGroupMember(supabase, gid);
    if (auth.error) return auth.error;
    const { user } = auth;

    const body = (await req.json()) as {
      title?: string;
      mode?: QuizMode;
      difficulty?: Difficulty | "mixed";
    };
    if (!body.title?.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const quiz: Quiz = {
      id: generateId("quiz"),
      title: body.title.trim(),
      tags: [],
      difficulty_mix: body.difficulty ?? "mixed",
      question_ids: [],
      created_at: new Date().toISOString(),
      mode: body.mode ?? "ordinary",
      created_by: user.id,
      visibility: "group",
      group_id: gid,
    };

    const { error } = await supabase.from("quizzes").insert(quiz);
    if (error) throw new Error(error.message);

    return NextResponse.json({ quizId: quiz.id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
