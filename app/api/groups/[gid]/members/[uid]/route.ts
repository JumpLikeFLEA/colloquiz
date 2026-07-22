import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireGroupMember } from "@/lib/groups";

// DELETE → leave the group (uid = self) or remove a member (owner).
//
// Which of the two is permitted is decided by the "group_members: leave or
// kick" RLS policy, not here. That policy also restricts DELETE to
// role = 'member', so the owner's own row can never be removed by either
// path — an owner who wants out must delete the group.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ gid: string; uid: string }> },
) {
  try {
    const supabase = await createClient();
    const { gid, uid } = await params;
    const auth = await requireGroupMember(supabase, gid);
    if (auth.error) return auth.error;

    const { data, error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", gid)
      .eq("user_id", uid)
      .select("id");
    if (error) throw new Error(error.message);

    // RLS filtered the row out rather than erroring: a member tried to kick
    // someone else, or either side tried to remove the owner.
    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "You can't remove that member. The group owner must delete the group to leave." },
        { status: 403 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
