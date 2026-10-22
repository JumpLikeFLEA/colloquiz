import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
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
  };
  return { deps, seen };
}
