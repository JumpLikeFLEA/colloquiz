import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  JOIN_TOKEN_PATTERN,
  parseJoinLinkState,
  parseTeacherJoinPreview,
  toLinkedStudent,
  toMyTeacher,
  type JoinLinkState,
  type LinkedStudent,
  type LinkedStudentRow,
  type MyTeacher,
  type MyTeacherRow,
  type TeacherJoinPreview,
} from "./teacherLinks";

// TCH-001 — the reads behind the join page, /my and Studio Learners (076,
// docs/decisions/0148). teacher_student_links has no grants: every read goes
// through a SECURITY DEFINER function that scopes by auth.uid().

/** The join page's view of a token, for the signed-in caller or anon. A
 * malformed token is not_found without a round trip. cache(): the page and
 * its generateMetadata may both call it. */
export const getTeacherJoinPreview = cache(async (token: string): Promise<TeacherJoinPreview> => {
  if (!JOIN_TOKEN_PATTERN.test(token)) return { state: "not_found" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("teacher_join_preview", { p_token: token });
  if (error) throw new Error(error.message);
  return parseTeacherJoinPreview(data);
});

/** The signed-in caller's active teachers. */
export async function getMyTeachers(): Promise<MyTeacher[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_teachers");
  if (error) throw new Error(error.message);
  return ((data ?? []) as MyTeacherRow[]).map(toMyTeacher);
}

/** The signed-in teacher's active students, people with no activity yet
 * included. Zero rows for anyone who isn't a teacher. */
export async function getLinkedStudents(): Promise<LinkedStudent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("teacher_linked_students");
  if (error) throw new Error(error.message);
  return ((data ?? []) as LinkedStudentRow[]).map(toLinkedStudent);
}

/** Whether the signed-in teacher has a join link (never the token). */
export async function getJoinLinkState(): Promise<JoinLinkState | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_teacher_join_link_state");
  if (error) throw new Error(error.message);
  return parseJoinLinkState(data);
}
