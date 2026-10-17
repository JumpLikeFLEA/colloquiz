import { NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { groupErrorMessage, normalizeGroupName } from "@/lib/teacherGroups";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/**
 * TCH-002 (docs/decisions/0149) — Studio's group actions as JSON:
 *   { action: "create", name }                      -> { id }
 *   { action: "rename", groupId, name }             -> { ok }
 *   { action: "delete", groupId }                   -> { ok }
 *   { action: "add", groupId, studentIds }          -> { added }
 *   { action: "remove", groupId, studentId }        -> { ok }
 *
 * Each is a SECURITY DEFINER RPC (077) that decides who may do it (a
 * teacher; the group's own teacher; a student linked to that teacher). This
 * route validates the shape and relays the RPC's error code as a message.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { action?: unknown; name?: unknown; groupId?: unknown; studentIds?: unknown; studentId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const relay = async (call: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
    const { data, error } = await call;
    if (error) return { failure: NextResponse.json({ error: "Something went wrong." }, { status: 500 }) };
    const r = (data ?? {}) as { ok?: boolean; error?: string } & Record<string, unknown>;
    if (!r.ok) {
      const status = r.error === "not_found" ? 404 : r.error === "forbidden" || r.error === "seat_lapsed" ? 403 : 400;
      return { failure: NextResponse.json({ error: groupErrorMessage(r.error) }, { status }) };
    }
    return { result: r };
  };

  if (body.action === "create" || body.action === "rename") {
    const name = typeof body.name === "string" ? normalizeGroupName(body.name) : null;
    if (!name) return NextResponse.json({ error: groupErrorMessage("invalid_name") }, { status: 400 });
    if (body.action === "create") {
      const out = await relay(supabase.rpc("create_teacher_group", { p_name: name }));
      return out.failure ?? NextResponse.json({ id: out.result.id });
    }
    if (!isId(body.groupId)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const out = await relay(supabase.rpc("rename_teacher_group", { p_group: body.groupId, p_name: name }));
    return out.failure ?? NextResponse.json({ ok: true });
  }

  if (body.action === "delete" && isId(body.groupId)) {
    const out = await relay(supabase.rpc("delete_teacher_group", { p_group: body.groupId }));
    return out.failure ?? NextResponse.json({ ok: true });
  }

  if (
    body.action === "add" &&
    isId(body.groupId) &&
    Array.isArray(body.studentIds) &&
    body.studentIds.every(isId)
  ) {
    const out = await relay(
      supabase.rpc("add_teacher_group_members", { p_group: body.groupId, p_students: body.studentIds }),
    );
    return out.failure ?? NextResponse.json({ added: out.result.added ?? 0 });
  }

  if (body.action === "remove" && isId(body.groupId) && isId(body.studentId)) {
    const out = await relay(
      supabase.rpc("remove_teacher_group_member", { p_group: body.groupId, p_student: body.studentId }),
    );
    return out.failure ?? NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid request." }, { status: 400 });
}
