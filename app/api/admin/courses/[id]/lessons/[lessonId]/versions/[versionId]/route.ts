import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { getLessonVersionDocument } from "@/lib/lessonContentAuthoring";

// GET a past version's document, for the version-history panel's "Restore
// as draft" action — the client loads it here, then POSTs it to the content
// route as a normal save (baseVersionId = the CURRENT latest version), which
// is what turns it into a new draft rather than reviving the old row.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string; versionId: string }> },
) {
  try {
    const { lessonId, versionId } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const document = await getLessonVersionDocument(lessonId, versionId);
    if (!document) return NextResponse.json({ error: "Version not found" }, { status: 404 });

    return NextResponse.json({ document });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
