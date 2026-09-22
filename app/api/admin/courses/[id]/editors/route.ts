import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";

const GrantEditorSchema = z.object({ email: z.string().trim().email() });

const ERROR_COPY: Record<string, string> = {
  forbidden: "You don't have permission to manage this course's editors.",
  course_not_found: "That course no longer exists.",
  user_not_found: "No account found with that email.",
};

// POST { email } → grant_course_editor (029, unchanged by this card).
// Delegation works entirely through the existing admin-only RPC; this route
// exists only to give the courses UI an endpoint to call it from.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = GrantEditorSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("grant_course_editor", {
      p_course_id: id,
      p_email: parsed.data.email,
    });
    if (error) throw new Error(error.message);

    const result = data as { ok: boolean; error?: string; user_id?: string };
    if (!result.ok) {
      const status = result.error === "forbidden" ? 403 : result.error === "course_not_found" ? 404 : 400;
      return NextResponse.json({ error: ERROR_COPY[result.error ?? ""] ?? "Could not add editor." }, { status });
    }

    return NextResponse.json({ ok: true, userId: result.user_id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
