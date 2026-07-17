import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AppNotification } from "@/types";

// GET → the current user's newest 20 notifications + unread count.
// RLS ("notifications: owner read") scopes every row to auth.uid(), so no
// explicit user filter is required for correctness — it is added anyway so the
// (user_id, created_at DESC) index is used.
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("notifications")
      .select("id, user_id, type, payload, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const notifications = (data ?? []) as AppNotification[];
    const unread = notifications.filter((n) => n.read_at == null).length;

    return NextResponse.json({ notifications, unread });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH → mark all of the user's unread notifications as read. Uses the
// column-scoped UPDATE (read_at) grant from migration 010; RLS restricts the
// update to the caller's own rows.
export async function PATCH() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
