import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const ReportSchema = z.object({
  questionId: z.string().min(1),
  category: z.enum(["wrong_answer", "unclear", "typo", "outdated", "other"]),
  comment: z.string().trim().max(2000).optional(),
  // The reporter's selected option, as answer text. Nullable — they may
  // report before answering. Captured silently; never shown in the form.
  selectedAnswer: z.string().max(500).nullable().optional(),
});

// POST { questionId, category, comment?, selectedAnswer? } → file a report.
// One OPEN report per (user, question): a duplicate hits the partial unique
// index and returns 409 { alreadyReported: true } so the client can show the
// "already reported" state. The question stays in the pool regardless.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json();
    const parsed = ReportSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }
    const { questionId, category, comment, selectedAnswer } = parsed.data;

    // Reportable only if the question exists and is in the active pool. RLS
    // already hides private questions from non-owners, so a missing row here
    // covers both "no such question" and "not visible to this user".
    const { data: question } = await supabase
      .from("questions")
      .select("id, status, options")
      .eq("id", questionId)
      .single();
    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }
    if (question.status !== "approved") {
      return NextResponse.json(
        { error: "Question is not in the active pool" },
        { status: 400 }
      );
    }

    // Only store the selected answer if it's genuinely one of the options —
    // this is triage telemetry, not user-validated input, so drop noise
    // silently rather than rejecting the report.
    const reportedAnswer =
      selectedAnswer && (question.options as string[]).includes(selectedAnswer)
        ? selectedAnswer
        : null;

    const { error: insertErr } = await supabase.from("question_reports").insert({
      question_id: questionId,
      user_id: user.id,
      category,
      comment: comment || null,
      reported_answer: reportedAnswer,
    });

    if (insertErr) {
      if (insertErr.code === "23505") {
        return NextResponse.json(
          { error: "already_reported", alreadyReported: true },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
