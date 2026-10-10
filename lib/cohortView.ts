import { authUserFrom } from "@/lib/auth";
import type { ActiveEnrolment, PublicRun, RunCall } from "@/lib/cohortCoursePage";
import { createClient } from "@/lib/supabase/server";

// COH-004 — the cohort half of a course page's read (docs/decisions/0108),
// called only for a `cohort` course. Three reads in parallel, each with the
// caller's own session, so RLS and the SECURITY DEFINER readers decide what
// comes back; nothing here widens it:
//   - course_runs: "published read" (058) — a run's title and dates are what
//     a visitor is shown (0093 "Non-enrolled visitor");
//   - run_enrolments: "owner read" (058) — the caller's own non-revoked rows.
//     Skipped for an anonymous visitor: anon has no grant on the table, and
//     has no rows to read;
//   - course_calls(course) (058): rows only for an editor and for an
//     `extended` enrolee of that run; zero rows for everyone else.

export type CohortView = {
  runs: PublicRun[];
  enrolments: ActiveEnrolment[];
  calls: RunCall[];
};

export async function getCohortView(courseId: string): Promise<CohortView> {
  const supabase = await createClient();
  const user = await authUserFrom(supabase);

  const [runsRes, enrolmentsRes, callsRes] = await Promise.all([
    supabase.from("course_runs").select("id, title, starts_at").eq("course_id", courseId).order("starts_at"),
    user
      ? supabase
          .from("run_enrolments")
          .select("run_id, tier, course_runs!inner(course_id)")
          .eq("course_runs.course_id", courseId)
          .is("revoked_at", null)
      : Promise.resolve({ data: [], error: null }),
    user ? supabase.rpc("course_calls", { p_course_id: courseId }) : Promise.resolve({ data: [], error: null }),
  ]);
  if (runsRes.error) throw new Error(runsRes.error.message);
  if (enrolmentsRes.error) throw new Error(enrolmentsRes.error.message);
  if (callsRes.error) throw new Error(callsRes.error.message);

  return {
    runs: (runsRes.data ?? []).map((r) => ({ id: r.id, title: r.title, startsAt: r.starts_at })),
    enrolments: ((enrolmentsRes.data ?? []) as { run_id: string; tier: "basic" | "extended" }[]).map((e) => ({
      runId: e.run_id,
      tier: e.tier,
    })),
    calls: ((callsRes.data ?? []) as { call_id: string; run_id: string; starts_at: string; meet_url: string; title: string | null }[]).map(
      (c) => ({ id: c.call_id, runId: c.run_id, startsAt: c.starts_at, meetUrl: c.meet_url, title: c.title }),
    ),
  };
}
