import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { courseAuthoringErrorResponse } from "@/lib/courseAuthoringErrors";
import { countPracticeBlocks, parseLessonDocument } from "@/lib/lessons";

const PublishSchema = z.object({
  expectedVersionId: z.string().uuid(),
});

// POST { expectedVersionId } → publish exactly the version the caller
// previewed. `expectedVersionId` is the only thing the client supplies about
// WHICH version; item count is never taken from the request — it is always
// derived here from that version's own stored document via
// countPracticeBlocks (lib/lessons), the same helper LessonPlayer uses to
// know what it's rendering. A client-supplied count would be both
// unnecessary (the document is already in the database) and a needless
// place for the published count to drift from the actual content.
//
// Staleness (migration 045's p_expected_version_id check on publish_lesson)
// is what makes "the version previewed" precise: if a newer draft was saved
// after the preview screen loaded this version's id, the RPC returns
// {ok:false, error:'stale'} and nothing is published — mapped to the same
// "changed elsewhere, reload" copy save_lesson_version's staleness already
// uses (lib/courseAuthoringErrors.ts).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsedInput = PublishSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsedInput.success) {
      return NextResponse.json({ error: parsedInput.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const { expectedVersionId } = parsedInput.data;

    const { data: versionRow, error: versionErr } = await supabase
      .from("lesson_versions")
      .select("document")
      .eq("lesson_id", lessonId)
      .eq("id", expectedVersionId)
      .maybeSingle();
    if (versionErr) throw new Error(versionErr.message);
    if (!versionRow) {
      return NextResponse.json({ error: "That version no longer exists." }, { status: 404 });
    }

    const parsed = parseLessonDocument(versionRow.document as unknown[]);
    if (!parsed.ok) {
      // Should be unreachable: every saved version already passed CNT-003
      // in content/route.ts before it was ever written. Not a crash either
      // way — a row that somehow didn't must not silently publish.
      return NextResponse.json({ error: "That version's content is no longer valid." }, { status: 422 });
    }
    const itemCount = countPracticeBlocks(parsed.document);

    const { data, error } = await supabase.rpc("publish_lesson", {
      p_lesson_id: lessonId,
      p_expected_version_id: expectedVersionId,
      p_item_count: itemCount,
    });
    if (error) throw new Error(error.message);

    const result = data as { ok: boolean; error?: string; version_id?: string; item_count?: number };
    if (!result.ok) {
      const { status, body } = courseAuthoringErrorResponse(result.error);
      return NextResponse.json(body, { status });
    }

    return NextResponse.json({ ok: true, versionId: result.version_id, itemCount: result.item_count });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
