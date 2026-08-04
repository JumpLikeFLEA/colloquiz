import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { COURSES_ENABLED } from "@/lib/featureFlags";

// enroll_in_course() returns these error codes; map each to a sentence. The
// paid path is dormant (everything ships free) but is copied here so a future
// Stripe course fails with a real message rather than a bare code.
const ERROR_COPY: Record<string, string> = {
  not_authenticated: "Please sign in to start this course.",
  course_not_found: "This course is not available.",
  payment_required: "This course requires a purchase.",
};

// POST /api/courses/[slug]/enroll → enroll the caller (idempotent). The RPC is
// SECURITY DEFINER and does its own auth + entitlement checks; this route only
// resolves identity for the 401 and translates the result.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    // Courses is dormant until released — see lib/featureFlags.ts.
    if (!COURSES_ENABLED) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { slug } = await params;
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase.rpc("enroll_in_course", { p_slug: slug });
    if (error) throw new Error(error.message);

    if (!data?.ok) {
      return NextResponse.json(
        { error: ERROR_COPY[data?.error as string] ?? "Could not start the course." },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, courseId: data.course_id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
