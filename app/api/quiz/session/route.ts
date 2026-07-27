import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import {
  getActiveSessionSummary,
  startOrResumeSession,
  saveProgress,
  abandonSession,
} from "@/lib/quizSession";

// GET → the user's active session summary (for the resume banner), or null.
export async function GET() {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const summary = await getActiveSessionSummary(supabase, user.id);
    return NextResponse.json(summary);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST { quizId, replace? } → start or resume. On conflict with a DIFFERENT
// active quiz, returns 409 { conflictQuizId } so the client can ask the user
// whether to discard it; the client re-POSTs with replace: true on confirm.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { quizId, replace } = (await req.json()) as {
      quizId?: string;
      replace?: boolean;
    };
    if (!quizId) {
      return NextResponse.json({ error: "quizId is required" }, { status: 400 });
    }

    const result = await startOrResumeSession(supabase, user.id, quizId, { replace });
    if (!result.ok) {
      return NextResponse.json({ conflictQuizId: result.conflictQuizId }, { status: 409 });
    }
    return NextResponse.json({ session: result.session });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH { quizId, currentIndex, answers } → persist resume progress.
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { quizId, currentIndex, answers } = (await req.json()) as {
      quizId?: string;
      currentIndex?: number;
      answers?: (number | null)[];
    };
    if (!quizId || typeof currentIndex !== "number" || !Array.isArray(answers)) {
      return NextResponse.json({ error: "Invalid progress payload" }, { status: 400 });
    }

    await saveProgress(supabase, user.id, quizId, currentIndex, answers);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE { quizId } → deactivate (Exit-confirm on the quiz screen).
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { quizId } = (await req.json()) as { quizId?: string };
    if (!quizId) {
      return NextResponse.json({ error: "quizId is required" }, { status: 400 });
    }

    await abandonSession(supabase, user.id, quizId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
