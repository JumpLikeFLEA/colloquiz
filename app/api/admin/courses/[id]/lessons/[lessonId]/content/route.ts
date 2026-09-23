import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { courseAuthoringErrorResponse } from "@/lib/courseAuthoringErrors";
import { parseLessonDocument } from "@/lib/lessons";

const SaveContentSchema = z.object({
  document: z.array(z.unknown()),
  baseVersionId: z.string().uuid().nullable(),
});

// POST { document, baseVersionId } → validate then save_lesson_version.
// The CNT-003 validator (parseLessonDocument) runs HERE, before the RPC —
// save_lesson_version's own JSONB check is a structural backstop only (see
// migration 041's header comment), not per-block validation. A failure here
// returns the full LessonParseError[] so the client can place each message
// next to the field it names (lib/lessonEditorErrors.ts).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsedInput = SaveContentSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsedInput.success) {
      return NextResponse.json({ error: parsedInput.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const { document, baseVersionId } = parsedInput.data;

    const parsed = parseLessonDocument(document);
    if (!parsed.ok) {
      return NextResponse.json({ error: "Invalid lesson content", errors: parsed.errors }, { status: 422 });
    }

    const { data, error } = await supabase.rpc("save_lesson_version", {
      p_lesson_id: lessonId,
      p_document: document,
      p_base_version_id: baseVersionId,
    });
    if (error) throw new Error(error.message);

    const result = data as { ok: boolean; error?: string; version_id?: string };
    if (!result.ok) {
      const { status, body } = courseAuthoringErrorResponse(result.error);
      return NextResponse.json(body, { status });
    }

    return NextResponse.json({ ok: true, versionId: result.version_id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
