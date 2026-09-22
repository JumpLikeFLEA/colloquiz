import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { courseAuthoringErrorResponse } from "@/lib/courseAuthoringErrors";

const StatusSchema = z.object({ status: z.enum(["published", "draft"]) });

// POST { status: "published" | "draft" } → publish_course / unpublish_course.
// Two separate RPCs (044) behind one route: the route's job is to translate
// the toggle in the UI into whichever RPC the requested state calls for, not
// to duplicate the authorization or state-transition logic either RPC already
// has.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = StatusSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const rpcName = parsed.data.status === "published" ? "publish_course" : "unpublish_course";
    const { data, error } = await supabase.rpc(rpcName, { p_course_id: id });
    if (error) throw new Error(error.message);

    const result = data as { ok: boolean; error?: string };
    if (!result.ok) {
      const { status, body } = courseAuthoringErrorResponse(result.error);
      return NextResponse.json(body, { status });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
