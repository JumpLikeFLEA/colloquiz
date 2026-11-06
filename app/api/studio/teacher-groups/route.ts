import { NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { relayRpc, type RpcAnswer } from "@/lib/studio/rpcRelay";
import { groupErrorMessage, normalizeGroupName } from "@/lib/teacherGroups";
import { isUuid } from "@/lib/ids";


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

  const relay = async (call: PromiseLike<RpcAnswer>) => {
    const out = await relayRpc(call, groupErrorMessage);
    return out.failure
      ? { failure: NextResponse.json({ error: out.failure.error }, { status: out.failure.status }) }
      : { result: out.result };
  };

  if (body.action === "create" || body.action === "rename") {
    const name = typeof body.name === "string" ? normalizeGroupName(body.name) : null;
    if (!name) return NextResponse.json({ error: groupErrorMessage("invalid_name") }, { status: 400 });
    if (body.action === "create") {
      const out = await relay(supabase.rpc("create_teacher_group", { p_name: name }));
      return out.failure ?? NextResponse.json({ id: out.result.id });
    }
    if (!isUuid(body.groupId)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const out = await relay(supabase.rpc("rename_teacher_group", { p_group: body.groupId, p_name: name }));
    return out.failure ?? NextResponse.json({ ok: true });
  }

  if (body.action === "delete" && isUuid(body.groupId)) {
    const out = await relay(supabase.rpc("delete_teacher_group", { p_group: body.groupId }));
    return out.failure ?? NextResponse.json({ ok: true });
  }

  if (
    body.action === "add" &&
    isUuid(body.groupId) &&
    Array.isArray(body.studentIds) &&
    body.studentIds.every(isUuid)
  ) {
    const out = await relay(
      supabase.rpc("add_teacher_group_members", { p_group: body.groupId, p_students: body.studentIds }),
    );
    return out.failure ?? NextResponse.json({ added: out.result.added ?? 0 });
  }

  if (body.action === "remove" && isUuid(body.groupId) && isUuid(body.studentId)) {
    const out = await relay(
      supabase.rpc("remove_teacher_group_member", { p_group: body.groupId, p_student: body.studentId }),
    );
    return out.failure ?? NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid request." }, { status: 400 });
}
