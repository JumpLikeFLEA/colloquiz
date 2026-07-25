import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET → the caller's group co-members ([{ id, name }]), for the results-screen
// "send to a co-member" picker. Resolved by the get_share_targets() RPC.
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase.rpc("get_share_targets");
    if (error) throw new Error(error.message);

    return NextResponse.json({ targets: data ?? [] });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
