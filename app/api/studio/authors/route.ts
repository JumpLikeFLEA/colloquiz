import { NextResponse, type NextRequest } from "next/server";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SEAT_ERRORS } from "@/lib/authorSeats";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const isoOrNull = (v: unknown): string | null | undefined => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return undefined;
  return Number.isNaN(Date.parse(v)) ? undefined : v;
};

/**
 * TCH-007 (docs/decisions/0154) — Studio's author-seat actions as JSON:
 *   { action: "add", email, publicName?, expiresAt?, notes? }  -> { userId }
 *   { action: "update", userId, publicName, notes }            -> { ok }
 *   { action: "expiry", userId, expiresAt }                    -> { ok }   (null = no expiry)
 *   { action: "freeze", userId }                               -> { ok }
 *   { action: "kind", userId, kind }                           -> { ok }
 *
 * Each is a SECURITY DEFINER RPC (082) that checks `is_admin` itself and
 * answers `forbidden` otherwise. This route validates the shape and relays
 * the RPC's code as a message; it is not the gate.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: {
    action?: unknown;
    email?: unknown;
    publicName?: unknown;
    expiresAt?: unknown;
    notes?: unknown;
    userId?: unknown;
    kind?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const bad = () => NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const str = (v: unknown) => (typeof v === "string" ? v : null);

  let call: PromiseLike<{ data: unknown; error: { message: string } | null }>;
  switch (body.action) {
    case "add": {
      const email = str(body.email);
      const expiresAt = isoOrNull(body.expiresAt);
      if (email === null || expiresAt === undefined) return bad();
      call = supabase.rpc("add_author_seat", {
        p_email: email,
        p_public_name: str(body.publicName),
        p_expires_at: expiresAt,
        p_notes: str(body.notes),
      });
      break;
    }
    case "update": {
      const name = str(body.publicName);
      if (!isId(body.userId) || name === null) return bad();
      call = supabase.rpc("update_author_seat", { p_user: body.userId, p_public_name: name, p_notes: str(body.notes) });
      break;
    }
    case "expiry": {
      const expiresAt = isoOrNull(body.expiresAt);
      if (!isId(body.userId) || expiresAt === undefined) return bad();
      call = supabase.rpc("set_author_seat_expiry", { p_user: body.userId, p_expires_at: expiresAt });
      break;
    }
    case "freeze": {
      if (!isId(body.userId)) return bad();
      call = supabase.rpc("freeze_author_seat", { p_user: body.userId });
      break;
    }
    case "kind": {
      if (!isId(body.userId) || (body.kind !== "house" && body.kind !== "teacher")) return bad();
      call = supabase.rpc("set_author_seat_kind", { p_user: body.userId, p_kind: body.kind });
      break;
    }
    default:
      return bad();
  }

  const { data, error } = await call;
  if (error) return NextResponse.json({ error: "Could not save the seat." }, { status: 500 });
  const r = (data ?? {}) as { ok?: boolean; error?: string; user_id?: string };
  if (!r.ok) {
    const known = r.error ? SEAT_ERRORS[r.error] : undefined;
    return NextResponse.json({ error: known?.message ?? "Could not save the seat." }, { status: known?.status ?? 400 });
  }
  return NextResponse.json(r.user_id ? { userId: r.user_id } : { ok: true });
}
