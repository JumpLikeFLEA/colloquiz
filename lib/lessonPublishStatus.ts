// AUTH-005 acceptance: "The editor shows whether a lesson has unpublished
// changes." Three states, not two — "published" alone conflates "published
// and exactly what a learner still sees" with "published, but the draft has
// since diverged," which is exactly the gap that made the publish_lesson
// staleness check (migration 045) necessary in the first place.

export type LessonPublishStatus = "unpublished" | "published-current" | "published-stale";

/**
 * `baseVersionId` is the latest saved draft's version id
 * (LessonContentDraft.baseVersionId); `publishedVersionId` is
 * `lessons.published_version_id`. Pure comparison — no I/O, so this is
 * testable without a database or a rendered component.
 */
export function lessonPublishStatus(
  baseVersionId: string | null,
  publishedVersionId: string | null,
): LessonPublishStatus {
  if (publishedVersionId === null) return "unpublished";
  return publishedVersionId === baseVersionId ? "published-current" : "published-stale";
}
