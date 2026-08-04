import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { answerOptions } from "@/lib/options";
import { shuffleOptions } from "@/lib/shuffleOptions";
import { renderToHtml } from "@/lib/richText";
import { COURSES_ENABLED } from "@/lib/featureFlags";
import type { CoursePracticeItem, Difficulty, ServedOption } from "@/types";

// RPC error codes → sentences. draw_practice_item / record_practice_answer are
// SECURITY DEFINER and do their own auth + enrollment checks; this route only
// resolves identity for the 401 and translates the result.
const ERROR_COPY: Record<string, string> = {
  not_authenticated: "Please sign in to practise.",
  stage_not_found: "This stage is not available.",
  not_enrolled: "Enroll in the course to practise this stage.",
  no_questions: "This stage has no practice questions yet.",
  not_found: "That question is not available.",
};

type DrawnQuestion = {
  id: string;
  question: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  difficulty: Difficulty;
};

// Shuffle (server-side, seeded so it never reorders under the cursor) and
// KaTeX-render the options once, index-aligned with `raw`. The client never sees
// the seed — same server-render-then-inject split as the quiz engine.
function serveOptions(options: string[], seed: string, questionId: string): ServedOption[] {
  return shuffleOptions(answerOptions(options), `${seed}:${questionId}`).map((raw) => ({
    raw,
    html: renderToHtml(raw),
  }));
}

// GET → the next practice item for this stage (unseen siblings first, then
// least-recently-seen; never a dead end). `ok: false, done: false` with a copy
// only on a real error; the RPC recycles the pool so `no_questions` means the
// stage genuinely has none authored.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Courses is dormant until released — see lib/featureFlags.ts.
    if (!COURSES_ENABLED) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { id } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase.rpc("draw_practice_item", { p_stage_id: id });
    if (error) throw new Error(error.message);

    if (!data?.ok) {
      return NextResponse.json(
        { error: ERROR_COPY[data?.error as string] ?? "Could not load a question." },
        { status: 400 },
      );
    }

    const q = data.question as DrawnQuestion;
    const item: CoursePracticeItem = {
      id: q.id,
      questionHtml: renderToHtml(q.question),
      options: serveOptions(q.options, data.seed as string, q.id),
      correctAnswer: q.correct_answer,
      explanationHtml: renderToHtml(q.explanation),
      difficulty: q.difficulty,
    };

    return NextResponse.json({ ok: true, item });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST { questionId, answer } → record the attempt (server-truth grading; drives
// last_correct for the wrong-first draw order and the derived needs_review).
// Practice never touches progress or gating. Returns the server's verdict so the
// client can reconcile, though it already showed local feedback.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Courses is dormant until released — see lib/featureFlags.ts.
    if (!COURSES_ENABLED) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // The stage id in the path is not needed by the RPC (the question id resolves
    // its stage), but keeping the route under /stages/[id] matches the surface.
    await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      questionId?: string;
      answer?: string;
    };
    if (!body.questionId || body.answer == null) {
      return NextResponse.json({ error: "questionId and answer are required" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("record_practice_answer", {
      p_question_id: body.questionId,
      p_answer: body.answer,
    });
    if (error) throw new Error(error.message);

    if (!data?.ok) {
      return NextResponse.json(
        { error: ERROR_COPY[data?.error as string] ?? "Could not record the answer." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      correct: data.correct as boolean,
      correctAnswer: data.correct_answer as string,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
