import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";

const ERROR_COPY: Record<string, string> = {
  not_authenticated: "Please sign in to create a group.",
  invalid_name: "Please give the group a name of at least 2 characters.",
};

// POST { name, description? } → create a group and make the caller its owner.
// Both writes happen inside the create_group() RPC so they share a
// transaction: a half-created group would have no members and therefore be
// unreadable and undeletable by anyone.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      description?: string;
    };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("create_group", {
      p_name: body.name,
      p_description: body.description ?? null,
    });
    if (error) throw new Error(error.message);

    if (!data?.ok) {
      return NextResponse.json(
        { error: ERROR_COPY[data?.error as string] ?? "Could not create the group." },
        { status: 400 },
      );
    }

    return NextResponse.json({ groupId: data.group_id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
