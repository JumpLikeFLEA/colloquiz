import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { listLessonVersions } from "@/lib/lessonContentAuthoring";

// GET the lesson's version history, for the version-history panel to
// refresh after a save or a restore without a full page reload.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const versions = await listLessonVersions(lessonId);
    return NextResponse.json({ versions });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
