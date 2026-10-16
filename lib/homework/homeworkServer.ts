import { createClient } from "@/lib/supabase/server";
import {
  groupAssignable,
  toMyHomework,
  toTeacherHomework,
  type AssignableCourse,
  type AssignableRow,
  type HomeworkListRow,
  type HomeworkProgressRow,
  type HomeworkTargetRow,
  type MyHomework,
  type MyHomeworkRow,
  type TeacherHomework,
} from "./homework";

// TCH-005 — the reads behind Studio's homework pages and /my (080,
// docs/decisions/0152). homework_assignments and homework_targets have no
// grants: every read goes through a SECURITY DEFINER function scoped to
// auth.uid(), so another teacher's assignments never come back.

/** The signed-in teacher's assignments, newest first. */
export async function getTeacherHomework(): Promise<TeacherHomework[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("teacher_homework_list");
  if (error) throw new Error(error.message);
  return ((data ?? []) as HomeworkListRow[]).map(toTeacherHomework);
}

/** Their targets as chosen (a student or a group). */
export async function getHomeworkTargets(): Promise<HomeworkTargetRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("teacher_homework_targets");
  if (error) throw new Error(error.message);
  return (data ?? []) as HomeworkTargetRow[];
}

/** Per (assignment, current recipient): done, best score, last activity. */
export async function getHomeworkProgress(): Promise<HomeworkProgressRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("teacher_homework_progress");
  if (error) throw new Error(error.message);
  return (data ?? []) as HomeworkProgressRow[];
}

/** What the assign dialog may offer: published courses and the caller's own. */
export async function getAssignableCourses(): Promise<AssignableCourse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("homework_assignable");
  if (error) throw new Error(error.message);
  return groupAssignable((data ?? []) as AssignableRow[]);
}

/** The signed-in learner's homework (published courses only, see 080 §6). */
export async function getMyHomework(): Promise<MyHomework[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_homework");
  if (error) throw new Error(error.message);
  return ((data ?? []) as MyHomeworkRow[]).map(toMyHomework);
}
