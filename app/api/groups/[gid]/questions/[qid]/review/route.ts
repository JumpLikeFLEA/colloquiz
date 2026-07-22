import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireGroupMember } from "@/lib/groups";

const ERROR_COPY: Record<string, string> = {
  not_authenticated: "Please sign in.",
  invalid_status: "Status must be approved or rejected.",
  not_found: "That question is no longer awaiting review.",
  not_a_member: "You are not a member of this group.",
  cannot_review_own: "You can't approve or reject your own question — ask another member.",
};

// POST { status: 'approved' | 'rejected' } → peer review one group question.
//
// The rule (any member except the drafter, plus the group owner as an
// unconditional backstop) is enforced by the guard trigger in migration 014,
// not here. This route exists for the reviewed_by/reviewed_at bookkeeping and
// to turn the rule violation into readable copy instead of a raised exception.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ gid: string; qid: string }> },
) {
  try {
    const supabase = await createClient();
    const { gid, qid } = await params;
    const auth = await requireGroupMember(supabase, gid);
    if (auth.error) return auth.error;

    const { status } = (await req.json()) as { status?: string };
    if (status !== "approved" && status !== "rejected") {
      return NextResponse.json({ error: ERROR_COPY.invalid_status }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("review_group_question", {
      p_question_id: qid,
      p_status: status,
    });
    if (error) throw new Error(error.message);

    if (!data?.ok) {
      return NextResponse.json(
        { error: ERROR_COPY[data?.error as string] ?? "Could not review this question." },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
