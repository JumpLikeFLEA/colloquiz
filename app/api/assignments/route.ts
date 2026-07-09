import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthor } from "@/lib/authorQuiz";

// Tutor assigns one of their quizzes to one or more linked students. RLS
// enforces that the caller owns the quiz and is linked to each student.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthor(supabase);
    if (auth.error) return auth.error;
    const { user } = auth;

    const { quizId, studentIds } = (await req.json()) as {
      quizId?: string;
      studentIds?: string[];
    };
    if (!quizId || !Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json({ error: "quizId and studentIds are required" }, { status: 400 });
    }

    const rows = studentIds.map((sid) => ({
      quiz_id: quizId,
      tutor_id: user.id,
      student_id: sid,
    }));

    const { error } = await supabase
      .from("assignments")
      .upsert(rows, { onConflict: "quiz_id,student_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
