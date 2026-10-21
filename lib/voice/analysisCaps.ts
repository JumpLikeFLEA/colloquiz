// Reading a refused send (VOICE-011, docs/decisions/0185). The caps live in a
// BEFORE INSERT trigger on voice_analysis_sends (migration 096); submit_voice_recording
// inserts into it, so a cap trips as a Postgres error with SQLSTATE PT429 that
// PostgREST turns into HTTP 429. DETAIL says which cap, HINT carries the next free
// time for the daily one. Matched on the code, never the message (the 026/038 rule).

export type VoiceCapKind = "task_cap" | "daily_cap";

export type VoiceCap = {
  kind: VoiceCapKind;
  /** ISO 8601 UTC time the daily cap frees a place; null for the per-task cap. */
  retryAt: string | null;
};

type PostgrestErrorLike = { code?: string | null; details?: string | null; hint?: string | null };

/** The cap a PostgREST error describes, or null when it is not a cap error. */
export function parseVoiceCap(error: PostgrestErrorLike | null | undefined): VoiceCap | null {
  if (!error || error.code !== "PT429") return null;
  if (error.details === "task_cap") return { kind: "task_cap", retryAt: null };
  if (error.details === "daily_cap") {
    const hint = error.hint ?? "";
    // Only a parseable instant is passed on; anything else is "try later".
    const retryAt = Number.isNaN(Date.parse(hint)) ? null : new Date(hint).toISOString();
    return { kind: "daily_cap", retryAt };
  }
  return null;
}
