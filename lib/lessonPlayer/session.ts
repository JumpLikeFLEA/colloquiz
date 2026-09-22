import type { ItemScoreResult } from "../items";
import { aggregateLessonScore, resolveExplanations, type LessonScoreResult, type ResolvedExplanation } from "../items";
import type { LessonDocument, LessonPracticeBlock } from "../lessons/parseLessonDocument";

/**
 * PLAY-001 — the pure orchestration layer between a parsed `LessonDocument`
 * and the player shell (`app/components/lesson-player/LessonPlayer.tsx`).
 * Kept here, not inline in the component, because this repo's test runner
 * (`vitest.config.ts`, docs/decisions/0004) is scoped to `lib/**` — there is
 * no jsdom/component-testing setup, so anything that needs a test lives as a
 * pure function the component merely calls. See
 * docs/decisions/0024-play001-lesson-player-shell.md.
 *
 * A practice item is only "attempted" once its renderer (PLAY-002..004, not
 * built by this card) reports an `ItemScoreResult` for its id. Until then the
 * lesson session simply has no entry for that item — `scoreSession` does not
 * synthesize a 0/0 placeholder for an unattempted item, matching
 * `aggregateLessonScore`'s own "no items yet" -> unscored behaviour (0016).
 */

export type LessonSessionResults = Readonly<Record<string, ItemScoreResult>>;

function practiceBlocks(document: LessonDocument): LessonPracticeBlock[] {
  return document.filter((block): block is LessonPracticeBlock => block.kind === "practice");
}

/** Rolls whatever practice items have been scored so far into a lesson-level
 * result. Order follows the authored document, not insertion order into
 * `results`. */
export function scoreSession(document: LessonDocument, results: LessonSessionResults): LessonScoreResult {
  const itemInputs = practiceBlocks(document)
    .filter((block) => results[block.id] !== undefined)
    .map((block) => ({ itemId: block.id, result: results[block.id] }));
  return aggregateLessonScore(itemInputs);
}

/** Resolved explanations for every scored-and-wrong sub-response, keyed by
 * the practice block's item id, in authored document order. An item with no
 * entry in `results` (not yet attempted) is simply absent from the map. */
export function explanationsForSession(
  document: LessonDocument,
  results: LessonSessionResults,
): ReadonlyMap<string, ResolvedExplanation[]> {
  const map = new Map<string, ResolvedExplanation[]>();
  for (const block of practiceBlocks(document)) {
    const result = results[block.id];
    if (result === undefined) continue;
    map.set(block.id, resolveExplanations(block.item, result));
  }
  return map;
}

/**
 * The click-to-load video facade's embed URL (CNT-003 acceptance: the
 * authored field is an 11-char id, never a URL — see
 * lib/lessons/theoryBlocks.ts). `youtube-nocookie.com` is the privacy-
 * enhanced domain: no tracking cookie is set until the learner opts in by
 * clicking, which is what makes a facade (rather than an eager iframe)
 * necessary in the first place (the no-cookie-banner decision is
 * load-bearing — docs/handoff.md, "Ops & resilience" in ui-decisions.md).
 * `rel=0` and `modestbranding=1` are cosmetic, not privacy-relevant.
 */
export function buildYouTubeEmbedUrl(youtubeId: string): string {
  return `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&modestbranding=1`;
}
