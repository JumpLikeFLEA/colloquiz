import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Group, GroupRole, Question, Quiz } from "@/types";

// ── Route guards ────────────────────────────────────────────
// Parallel to requireAuthor() in lib/authorQuiz.ts, returning the same
// { user } | { error } shape. Note there is deliberately no is_author check:
// group membership is itself the authoring credential.

type Guard =
  | { user: { id: string }; error?: never }
  | { user?: never; error: NextResponse };

async function requireGroupRole(
  supabase: SupabaseClient,
  groupId: string,
  ownerOnly: boolean,
): Promise<Guard> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: member } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  // 404 rather than 403 for a non-member: whether a given group id exists is
  // not information a stranger needs.
  if (!member) {
    return { error: NextResponse.json({ error: "Group not found" }, { status: 404 }) };
  }
  if (ownerOnly && member.role !== "owner") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

export function requireGroupMember(supabase: SupabaseClient, groupId: string) {
  return requireGroupRole(supabase, groupId, false);
}

export function requireGroupOwner(supabase: SupabaseClient, groupId: string) {
  return requireGroupRole(supabase, groupId, true);
}

// ── Group quiz helpers (shared by the question CRUD routes) ─

/**
 * Loads a quiz and confirms it belongs to this group. Guards against a member
 * of group A mutating a quiz owned by group B.
 */
export async function loadGroupQuiz(
  supabase: SupabaseClient,
  quizId: string,
  groupId: string,
): Promise<Quiz | null> {
  const { data } = await supabase.from("quizzes").select("*").eq("id", quizId).maybeSingle();
  const quiz = data as Quiz | null;
  if (!quiz || quiz.group_id !== groupId) return null;
  return quiz;
}

/**
 * Recomputes a group quiz's tag list from the questions it currently holds.
 *
 * The solo author route derives tags from the payload it just wrote, which it
 * can do because it replaces the whole question set. Here questions arrive one
 * at a time, so tags have to be re-derived from the stored rows.
 */
export async function syncQuizTags(supabase: SupabaseClient, quizId: string): Promise<void> {
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("question_ids")
    .eq("id", quizId)
    .maybeSingle();
  if (!quiz) return;

  const ids = (quiz.question_ids ?? []) as string[];
  const { data: questions } = ids.length
    ? await supabase.from("questions").select("tags").in("id", ids)
    : { data: [] };

  const tags = [...new Set((questions ?? []).flatMap((q) => (q.tags ?? []) as string[]))];
  await supabase.from("quizzes").update({ tags }).eq("id", quizId);
}

// ── The current user's groups ───────────────────────────────

export type MyGroup = {
  id: string;
  name: string;
  description: string | null;
  role: GroupRole;
  memberCount: number;
  quizCount: number;
};

export async function getMyGroups(
  supabase: SupabaseClient,
  userId: string,
): Promise<MyGroup[]> {
  const { data: memberships, error } = await supabase
    .from("group_members")
    .select("group_id, role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  const rows = memberships ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.group_id as string);

  // Batch-resolve rather than querying per group.
  const [{ data: groups }, { data: allMembers }, { data: quizzes }] = await Promise.all([
    supabase.from("groups").select("*").in("id", ids).order("created_at", { ascending: false }),
    supabase.from("group_members").select("group_id").in("group_id", ids),
    supabase.from("quizzes").select("group_id").in("group_id", ids),
  ]);

  const memberCount = new Map<string, number>();
  for (const m of allMembers ?? []) {
    memberCount.set(m.group_id, (memberCount.get(m.group_id) ?? 0) + 1);
  }
  const quizCount = new Map<string, number>();
  for (const q of quizzes ?? []) {
    if (q.group_id) quizCount.set(q.group_id, (quizCount.get(q.group_id) ?? 0) + 1);
  }
  const role = new Map(rows.map((r) => [r.group_id as string, r.role as GroupRole]));

  return ((groups ?? []) as Group[]).map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description ?? null,
    role: role.get(g.id) ?? "member",
    memberCount: memberCount.get(g.id) ?? 0,
    quizCount: quizCount.get(g.id) ?? 0,
  }));
}

// ── A single group, prepared for the detail view ────────────

export type GroupMemberView = {
  id: string;
  name: string;
  role: GroupRole;
  joinedAt: string;
};

export type GroupQuizView = {
  id: string;
  title: string;
  questionCount: number;
  // Only approved questions are served during play, so the card shows both
  // numbers ("5 questions · 3 approved") rather than implying the whole set
  // is playable.
  approvedCount: number;
  created_at: string;
};

export type GroupDetail = {
  group: Group;
  role: GroupRole;
  members: GroupMemberView[];
  quizzes: GroupQuizView[];
  pendingCount: number;
};

/**
 * Returns null when the caller is not a member — same guard shape as
 * getAssignmentForReview() in lib/author.ts.
 */
export async function getGroup(
  supabase: SupabaseClient,
  groupId: string,
  userId: string,
): Promise<GroupDetail | null> {
  const { data: group } = await supabase
    .from("groups")
    .select("*")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) return null;

  const { data: members } = await supabase
    .from("group_members")
    .select("user_id, role, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });

  const memberRows = members ?? [];
  const mine = memberRows.find((m) => m.user_id === userId);
  if (!mine) return null;

  const [{ data: profiles }, { data: quizzes }, { data: pendingRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, full_name")
      .in("id", memberRows.map((m) => m.user_id)),
    supabase
      .from("quizzes")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false }),
    // Scoped exactly like getGroupReviewQueue, so the "awaiting review" banner
    // can never promise a queue that then renders empty. A question promoted to
    // the public pool leaves both (its visibility is no longer 'group').
    supabase
      .from("questions")
      .select("id")
      .eq("group_id", groupId)
      .eq("visibility", "group")
      .eq("status", "pending"),
  ]);

  const name = new Map(
    (profiles ?? []).map((p) => [p.id, (p.full_name || p.display_name || "Member") as string]),
  );

  const quizRows = (quizzes ?? []) as Quiz[];

  // Statuses for every question the group's quizzes reference, looked up by id
  // rather than by group_id. Readability is then the same discriminator the
  // play path uses (app/(main)/quiz/[id]/page.tsx serves only rows it can read
  // that are 'approved'), so the card's "N questions · M approved" always
  // matches what a member is actually served. A row RLS hides — a question
  // promoted to the pool, say — is absent here and counted as not approved,
  // exactly as play will drop it.
  const referencedIds = [...new Set(quizRows.flatMap((q) => q.question_ids))];
  const { data: statusRows } = referencedIds.length
    ? await supabase.from("questions").select("id, status").in("id", referencedIds)
    : { data: [] };
  const status = new Map(
    ((statusRows ?? []) as Pick<Question, "id" | "status">[]).map((q) => [q.id, q.status]),
  );

  return {
    group: group as Group,
    role: mine.role as GroupRole,
    members: memberRows.map((m) => ({
      id: m.user_id as string,
      name: name.get(m.user_id) ?? "Member",
      role: m.role as GroupRole,
      joinedAt: m.created_at as string,
    })),
    quizzes: quizRows.map((q) => ({
      id: q.id,
      title: q.title,
      questionCount: q.question_ids.length,
      approvedCount: q.question_ids.filter((id) => status.get(id) === "approved").length,
      created_at: q.created_at,
    })),
    pendingCount: (pendingRows ?? []).length,
  };
}

// ── The group's review queue ────────────────────────────────

export type ReviewItem = {
  question: Question;
  authorName: string;
  // Whether the *viewer* may act on this item: peers may, the drafter may
  // not, and the group owner always may (which is what unblocks a group that
  // has only one member).
  canReview: boolean;
};

export async function getGroupReviewQueue(
  supabase: SupabaseClient,
  groupId: string,
  userId: string,
  viewerRole: GroupRole,
): Promise<ReviewItem[]> {
  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .eq("group_id", groupId)
    .eq("visibility", "group")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Question[];
  if (rows.length === 0) return [];

  const authorIds = [...new Set(rows.map((q) => q.created_by).filter(Boolean))] as string[];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, full_name")
    .in("id", authorIds);
  const name = new Map(
    (profiles ?? []).map((p) => [p.id, (p.full_name || p.display_name || "Member") as string]),
  );

  return rows.map((q) => ({
    question: q,
    authorName: (q.created_by && name.get(q.created_by)) || "Member",
    canReview: q.created_by !== userId || viewerRole === "owner",
  }));
}
