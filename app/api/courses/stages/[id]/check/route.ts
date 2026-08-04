import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { answerOptions } from "@/lib/options";
import { shuffleOptions } from "@/lib/shuffleOptions";
import { renderToHtml } from "@/lib/richText";
import { COURSES_ENABLED } from "@/lib/featureFlags";
import type { CourseCheckItem, CourseCheckResult, Difficulty, ServedOption } from "@/types";

// RPC error codes → sentences. start_stage_check / submit_stage_check are
// SECURITY DEFINER and hold the only authorization in the path (enrollment,
// unlock, ownership, single-submission); this route resolves identity for the
// 401 and translates the result.
const ERROR_COPY: Record<string, string> = {
  not_authenticated: "Please sign in to start the check.",
  stage_not_found: "This stage is not available.",
  not_enrolled: "Enroll in the course to take this check.",
  locked: "Complete the earlier stages to unlock this check.",
  no_questions: "This stage has no check questions yet.",
  attempt_unavailable: "This attempt is no longer open. Start a fresh check.",
};

type StartItem = {
  id: string;
  question: string;
  options: string[];
  difficulty: Difficulty;
  is_review: boolean;
};

type SubmitResultRow = {
  question_id: string;
  is_review: boolean;
  correct: boolean;
  correct_answer: string;
  given: string | null;
};

// Option order is seeded on the attempt id, so it is stable across re-render and
// resume (a resumed check returns the SAME attempt id) and legitimately reshuffles
// on a retake (a new attempt). Rendered + shuffled once here; the client never
// sees the seed.
function serveOptions(options: string[], attemptId: string, questionId: string): ServedOption[] {
  return shuffleOptions(answerOptions(options), `${attemptId}:${questionId}`).map((raw) => ({
    raw,
    html: renderToHtml(raw),
  }));
}

// POST → start (or resume) the stage check. Idempotent-start: an open attempt is
// returned as-is with its recorded questions, so double-clicking or refreshing
// never rerolls the draw.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Courses is dormant until released — see lib/featureFlags.ts.
    if (!COURSES_ENABLED) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { id } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase.rpc("start_stage_check", { p_stage_id: id });
    if (error) throw new Error(error.message);

    if (!data?.ok) {
      return NextResponse.json(
        { error: ERROR_COPY[data?.error as string] ?? "Could not start the check." },
        { status: 400 },
      );
    }

    const attemptId = data.attempt_id as string;
    const items: CourseCheckItem[] = (data.items as StartItem[]).map((it) => ({
      id: it.id,
      questionHtml: renderToHtml(it.question),
      options: serveOptions(it.options, attemptId, it.id),
      difficulty: it.difficulty,
      isReview: it.is_review,
    }));

    return NextResponse.json({ ok: true, attemptId, items });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH { attemptId, answers } → grade and submit. answers maps question_id → the
// chosen RAW option string; submit_stage_check grades the RECORDED questions
// server-side (never the payload) and returns per-item results + {score, passed}.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Courses is dormant until released — see lib/featureFlags.ts.
    if (!COURSES_ENABLED) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await params; // stage id is in the path; submit is keyed on the attempt id
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      attemptId?: string;
      answers?: Record<string, string>;
    };
    if (!body.attemptId || typeof body.answers !== "object" || body.answers == null) {
      return NextResponse.json({ error: "attemptId and answers are required" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("submit_stage_check", {
      p_attempt_id: body.attemptId,
      p_answers: body.answers,
    });
    if (error) throw new Error(error.message);

    if (!data?.ok) {
      return NextResponse.json(
        { error: ERROR_COPY[data?.error as string] ?? "Could not submit the check." },
        { status: 400 },
      );
    }

    const result: CourseCheckResult = {
      score: Number(data.score),
      passed: data.passed as boolean,
      newCorrect: data.new_correct as number,
      newTotal: data.new_total as number,
      reviewCorrect: data.review_correct as number,
      reviewTotal: data.review_total as number,
      results: (data.results as SubmitResultRow[]).map((r) => ({
        questionId: r.question_id,
        isReview: r.is_review,
        correct: r.correct,
        correctAnswer: r.correct_answer,
        given: r.given,
      })),
    };

    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
