import { createClient } from "@/lib/supabase/server";
import { toTeacherGroup, type GroupMemberRow, type TeacherGroup, type TeacherGroupRow } from "./teacherGroups";

// TCH-002 — the reads behind Studio's groups pages and the Learners filter
// (077, docs/decisions/0149). teacher_groups and teacher_group_members have
// no grants: every read goes through a SECURITY DEFINER function scoped to
// auth.uid(), so another teacher's groups never come back.

/** The signed-in teacher's groups, with member counts. */
export async function getTeacherGroups(): Promise<TeacherGroup[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("teacher_groups_list");
  if (error) throw new Error(error.message);
  return ((data ?? []) as TeacherGroupRow[]).map(toTeacherGroup);
}

/** Every (group, student) pair of the signed-in teacher. */
export async function getGroupMemberRows(): Promise<GroupMemberRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("teacher_group_member_rows");
  if (error) throw new Error(error.message);
  return (data ?? []) as GroupMemberRow[];
}
