import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";

const UpdateSchema = z
  .object({
    status: z.enum(["approved", "rejected"]).optional(),
    question: z.string().min(1).optional(),
    options: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1), z.string().min(1)]).optional(),
    correct_answer: z.string().min(1).optional(),
    explanation: z.string().min(1).optional(),
    tags: z.array(z.string()).optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: "At least one field must be provided",
  });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const json = await req.json();
    const parsed = UpdateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }
    const body = parsed.data;

    // Consistency check: correct_answer must be one of the options after the update.
    if (body.options || body.correct_answer) {
      const { data: existing, error: fetchErr } = await supabase
        .from("questions")
        .select("options, correct_answer")
        .eq("id", id)
        .single();
      if (fetchErr || !existing) {
        return NextResponse.json({ error: "Question not found" }, { status: 404 });
      }
      const finalOptions = (body.options ?? existing.options) as string[];
      const finalCorrect = (body.correct_answer ?? existing.correct_answer) as string;
      if (!finalOptions.includes(finalCorrect)) {
        return NextResponse.json(
          { error: "correct_answer must match one of the options verbatim" },
          { status: 400 }
        );
      }
    }

    // Build the update payload
    const update: Record<string, unknown> = {};
    if (body.question !== undefined) update.question = body.question;
    if (body.options !== undefined) update.options = body.options;
    if (body.correct_answer !== undefined) update.correct_answer = body.correct_answer;
    if (body.explanation !== undefined) update.explanation = body.explanation;
    if (body.tags !== undefined) update.tags = body.tags;
    if (body.difficulty !== undefined) update.difficulty = body.difficulty;
    if (body.status !== undefined) {
      update.status = body.status;
      update.reviewed_at = new Date().toISOString();
      update.reviewed_by = user.id;
    }

    const { error: updateErr } = await supabase
      .from("questions")
      .update(update)
      .eq("id", id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
