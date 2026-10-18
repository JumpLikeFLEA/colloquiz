import { NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LISTING_ERRORS } from "@/lib/listedCourses";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * TCH-010 (docs/decisions/0171) — { courseId, listed } -> { ok }.
 * set_course_listed (088) checks `is_admin` itself and answers `forbidden`
 * otherwise. This route validates the shape and relays the code as a
 * message; it is not the gate.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { courseId?: unknown; listed?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.courseId !== "string" || !UUID.test(body.courseId) || typeof body.listed !== "boolean") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("set_course_listed", { p_course: body.courseId, p_listed: body.listed });
  if (error) return NextResponse.json({ error: "Could not save." }, { status: 500 });
  const r = (data ?? {}) as { ok?: boolean; error?: string };
  if (!r.ok) {
    const known = r.error ? LISTING_ERRORS[r.error] : undefined;
    return NextResponse.json({ error: known?.message ?? "Could not save." }, { status: known?.status ?? 400 });
  }
  return NextResponse.json({ ok: true });
}
