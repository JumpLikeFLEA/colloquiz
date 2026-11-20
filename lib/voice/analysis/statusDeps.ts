import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LESSON_TARGET_COLUMNS, toLessonTargets } from "./lessonTargets";
import { offerFrom } from "./offer";
import type { StatusDeps } from "./status";

/**
 * The reads behind readAnalysisStatus (status.ts): under the caller's own session, plus the
 * three service-role reads that answer what RLS hides from the owner. Moved out of the status
 * route (VOICE-014, docs/decisions/0189) so the before/after screen (PROG-007, docs/decisions/
 * 0191) asks the same question the same way instead of deciding it a second time.
 *
 * Every service-role read runs only after `ownsTake` has proved the take is the caller's, and
 * returns one value, never a row (the 0189 Decision 1 pattern).
 */
export function statusDeps(supabase: SupabaseClient, userId: string, admin: () => SupabaseClient) {
  // The row as RLS showed it, kept for the re-claim check in the route (per request, never shared).
  const seen: { status: string; updatedAt: string } = { status: "", updatedAt: "" };
  const deps: StatusDeps = {
    async ownsTake(id) {
      const { data, error } = await supabase
        .from("voice_submissions")
        .select("id")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },
    async readVisible(id) {
      const { data, error } = await supabase
        .from("voice_analyses")
        .select("status, transcript, result, updated_at")
        .eq("submission_id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      seen.status = data.status as string;
      seen.updatedAt = data.updated_at as string;
      return { status: data.status as string, transcript: data.transcript as string | null, result: data.result };
    },
    async readHidden(id) {
      const { data, error } = await admin()
        .from("voice_analyses")
        .select("hidden_at")
        .eq("submission_id", id)
        .maybeSingle();
      if (error) throw error;
      return data?.hidden_at != null;
    },
    async readLedger(id) {
      const { data, error } = await admin()
        .from("voice_analysis_sends")
        .select("analysed, uncounted_reason")
        .eq("submission_id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data ? { analysed: data.analysed as boolean, uncountedReason: data.uncounted_reason as string | null } : null;
    },
    async readBaselineId(id) {
      const { data, error } = await admin()
        .from("voice_analyses")
        .select("baseline_submission_id")
        .eq("submission_id", id)
        .maybeSingle();
      if (error) throw error;
      return (data?.baseline_submission_id as string | null) ?? null;
    },
    async readBaseline(id) {
      // Under the caller's session again: a hidden or purged first analysis simply is not there.
      const { data, error } = await supabase
        .from("voice_analyses")
        .select("status, transcript, result")
        .eq("submission_id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data || data.status !== "done" || typeof data.transcript !== "string") return null;
      return { transcript: data.transcript as string, result: data.result };
    },
    async readLessonTargets(ids) {
      // Under the caller's session: the course page's own rows. RLS decides what a lesson is to them.
      const { data, error } = await supabase.from("lessons").select(LESSON_TARGET_COLUMNS).in("id", ids);
      if (error) throw error;
      return toLessonTargets(data ?? []);
    },
    async readOffer(ids) {
      // `lesson_state` (055) is the single decision; the course's join link is a public column.
      const states = await Promise.all(
        ids.map(async (id) => {
          const { data, error } = await supabase.rpc("lesson_state", { p_lesson_id: id });
          if (error) throw error;
          const row = (Array.isArray(data) ? data[0] : data) as { state?: unknown } | null | undefined;
          return typeof row?.state === "string" ? row.state : null;
        }),
      );
      if (!states.includes("needs_entitlement")) return null;
      const { data, error } = await supabase
        .from("lessons")
        .select("id, courses(how_to_join_url)")
        .in("id", ids);
      if (error) throw error;
      for (const raw of data ?? []) {
        const c = (raw as { courses: unknown }).courses;
        const course = (Array.isArray(c) ? c[0] : c) as { how_to_join_url?: unknown } | null;
        const offer = offerFrom(states, course?.how_to_join_url);
        if (offer) return offer;
      }
      return null;
    },
  };
  return { deps, seen };
}
