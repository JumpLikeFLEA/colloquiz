import { createClient } from "@/lib/supabase/server";

// AUTH-010 — read side of the cohort editor's runs page (migration 058,
// docs/decisions/0093 / 0105). Called only from pages already gated on
// canEditCourse(id).
//
// Runs come from `course_runs` through its "editor read" policy; calls come
// from `course_calls(course)`, their only reader (run_calls has no grants),
// which returns every run's calls to an editor of the course and zero rows to
// anyone else. A run's ends_at is the stored value 058's trigger keeps
// (0093 a); this module never recomputes it.

export type CourseCall = {
  id: string;
  runId: string;
  startsAt: string;
  meetUrl: string;
  title: string | null;
};

export type CourseRun = {
  id: string;
  title: string | null;
  startsAt: string;
  endsAt: string;
  calls: CourseCall[];
};

export async function getCourseRuns(courseId: string): Promise<CourseRun[]> {
  const supabase = await createClient();

  const [runsRes, callsRes] = await Promise.all([
    supabase
      .from("course_runs")
      .select("id, title, starts_at, ends_at")
      .eq("course_id", courseId)
      .order("starts_at"),
    supabase.rpc("course_calls", { p_course_id: courseId }),
  ]);
  if (runsRes.error) throw new Error(runsRes.error.message);
  if (callsRes.error) throw new Error(callsRes.error.message);

  const calls = (callsRes.data ?? []) as {
    call_id: string;
    run_id: string;
    starts_at: string;
    meet_url: string;
    title: string | null;
  }[];

  return (runsRes.data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    calls: calls
      .filter((c) => c.run_id === r.id)
      .map((c) => ({ id: c.call_id, runId: c.run_id, startsAt: c.starts_at, meetUrl: c.meet_url, title: c.title })),
  }));
}
