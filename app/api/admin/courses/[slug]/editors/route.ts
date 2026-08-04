import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";

// grant_course_editor / revoke_course_editor (029) both self-gate on is_admin;
// this route resolves identity for the 401 and translates the error codes.
const ERROR_COPY: Record<string, string> = {
  forbidden: "Only admins can manage course editors.",
  course_not_found: "That course no longer exists.",
  user_not_found: "No user found with that email.",
};

/**
 * GET /api/admin/courses/[slug]/editors
 *   → list current editors of the course (id, email, display name). Admin-only.
 *
 * POST /api/admin/courses/[slug]/editors  { email }
 *   → grant edit rights. Idempotent (ON CONFLICT DO NOTHING in the RPC).
 *
 * DELETE /api/admin/courses/[slug]/editors { userId }
 *   → revoke edit rights.
 */
async function requireAdmin(userId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  return profile?.role === "admin";
}

async function courseIdBySlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slug: string,
): Promise<string | null> {
  const { data } = await supabase.from("courses").select("id").eq("slug", slug).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await requireAdmin(user.id, supabase))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const courseId = await courseIdBySlug(supabase, slug);
    if (!courseId) return NextResponse.json({ error: "Course not found" }, { status: 404 });

    // The admin-read RLS policy on course_editors (029) opens this to admins.
    // course_editors has TWO FKs to profiles (user_id and granted_by), so the
    // embed is disambiguated by naming the column PostgREST should join on —
    // otherwise the call fails with "more than one relationship was found".
    const { data, error } = await supabase
      .from("course_editors")
      .select("user_id, granted_at, editor:profiles!user_id(full_name, display_name)")
      .eq("course_id", courseId)
      .order("granted_at", { ascending: true });
    if (error) throw new Error(error.message);

    // PostgREST types every FK embed as an array even for a to-one relation, so
    // the join is unwrapped by taking the first (and only) row.
    type Row = {
      user_id: string;
      granted_at: string;
      editor: { full_name: string | null; display_name: string | null }[] | null;
    };

    const editors = ((data ?? []) as Row[]).map((r) => {
      const editor = r.editor?.[0];
      return {
        userId: r.user_id,
        grantedAt: r.granted_at,
        name: editor?.full_name ?? editor?.display_name ?? null,
      };
    });
    return NextResponse.json({ ok: true, editors });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { email?: string };
    if (!body.email) return NextResponse.json({ error: "email is required" }, { status: 400 });

    const courseId = await courseIdBySlug(supabase, slug);
    if (!courseId) return NextResponse.json({ error: "Course not found" }, { status: 404 });

    const { data, error } = await supabase.rpc("grant_course_editor", {
      p_course_id: courseId,
      p_email: body.email,
    });
    if (error) throw new Error(error.message);

    if (!data?.ok) {
      const code = (data?.error as string) ?? "unknown";
      const status = code === "forbidden" ? 403 : code === "course_not_found" ? 404 : 400;
      return NextResponse.json(
        { ok: false, error: code, message: ERROR_COPY[code] ?? "Grant failed." },
        { status },
      );
    }
    return NextResponse.json({ ok: true, userId: data.user_id as string });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { userId?: string };
    if (!body.userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

    const courseId = await courseIdBySlug(supabase, slug);
    if (!courseId) return NextResponse.json({ error: "Course not found" }, { status: 404 });

    const { data, error } = await supabase.rpc("revoke_course_editor", {
      p_course_id: courseId,
      p_user_id: body.userId,
    });
    if (error) throw new Error(error.message);

    if (!data?.ok) {
      const code = (data?.error as string) ?? "unknown";
      const status = code === "forbidden" ? 403 : 400;
      return NextResponse.json(
        { ok: false, error: code, message: ERROR_COPY[code] ?? "Revoke failed." },
        { status },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
