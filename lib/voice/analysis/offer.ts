/**
 * The offer next to an interim analysis's course links (VOICE-018, docs/decisions/0231).
 *
 * The model gives evidence only; the page makes the offer (0229 Decision 5). Whether to make it is
 * decided in SQL: `lesson_state()` (055) says `needs_entitlement` for a linked lesson the caller
 * cannot open, and nothing here, nor the view, decides access (CLAUDE.md, "Entitlement is decided in
 * one place"). The target is the course's existing "how to join" link (PAY-001, 0136), and no price
 * is carried: no course column holds one.
 *
 * Pure: the reads are in statusDeps.ts.
 */

export type AnalysisOffer = { howToJoinUrl: string };

/** `courses.how_to_join_url` is https-only by CHECK (058); checked again because this becomes an href. */
function httpsUrl(v: unknown): string | null {
  if (typeof v !== "string" || v === "") return null;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

/**
 * An offer when at least one linked lesson's SQL state says the caller needs access AND the course
 * has a join link. With no link there is nothing to offer, so no offer: a card with no action would
 * only say "this is paid".
 */
export function offerFrom(states: readonly (string | null)[], howToJoinUrl: unknown): AnalysisOffer | null {
  if (!states.includes("needs_entitlement")) return null;
  const url = httpsUrl(howToJoinUrl);
  return url ? { howToJoinUrl: url } : null;
}

/** The client's read of an `offer` value off the status JSON; anything else is no offer. */
export function parseOffer(raw: unknown): AnalysisOffer | null {
  if (typeof raw !== "object" || raw === null) return null;
  const url = httpsUrl((raw as Record<string, unknown>).howToJoinUrl);
  return url ? { howToJoinUrl: url } : null;
}
