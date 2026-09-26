/**
 * Maps the `error` field of a course-authoring RPC's `{ ok, error }` result
 * (migration 044) to an HTTP status and a copy string. One shared table
 * because the same error codes recur across create_course, update_course,
 * publish_course, unpublish_course, create_lesson, update_lesson,
 * set_lesson_archived, reorder_lessons, save_lesson_version and
 * publish_lesson.
 */
export const COURSE_AUTHORING_ERRORS: Record<string, { status: number; message: string }> = {
  forbidden: { status: 403, message: "You don't have permission to edit this course." },
  course_not_found: { status: 404, message: "That course no longer exists." },
  lesson_not_found: { status: 404, message: "That lesson no longer exists." },
  invalid_title: { status: 400, message: "Please enter a title." },
  invalid_slug: { status: 400, message: "Slug must be lowercase letters, numbers and hyphens only." },
  invalid_level: { status: 400, message: "Please choose a valid level." },
  invalid_estimated_minutes: { status: 400, message: "Estimated minutes must be a positive number." },
  slug_taken: { status: 409, message: "That slug is already in use by another course." },
  // update_lesson_slug (046): scoped to the lesson's own course, so the
  // message says "lesson" rather than reusing slug_taken's course-scoped copy.
  lesson_slug_taken: { status: 409, message: "That slug is already used by another lesson in this course." },
  // update_lesson_slug (046): the lesson has been published at least once —
  // slug_frozen_at is set and update_lesson_slug refuses unconditionally,
  // regardless of the lesson's current archived/published state.
  slug_frozen: { status: 409, message: "This lesson's slug can't be changed once it has been published." },
  lesson_set_mismatch: { status: 409, message: "The lesson list changed elsewhere — reload and try again." },
  // save_lesson_version (041): p_base_version_id didn't match the true
  // latest version — someone else saved first. Same "reload, don't clobber"
  // contract as lesson_set_mismatch above.
  stale: { status: 409, message: "This lesson changed elsewhere — reload and try again." },
  invalid_document: { status: 400, message: "The lesson content isn't a valid document." },
  no_draft: { status: 400, message: "There's no draft to publish yet." },
  // publish_lesson (045): should be unreachable, since the publish route
  // always derives p_item_count server-side from the stored version's own
  // document (never from the request) — kept for the same reason every
  // other RPC error code here is mapped rather than falling through to the
  // generic 400.
  invalid_item_count: { status: 400, message: "That lesson's item count couldn't be determined." },
};

export function courseAuthoringErrorResponse(code: string | undefined): { status: number; body: { error: string } } {
  const known = COURSE_AUTHORING_ERRORS[code ?? ""];
  if (known) return { status: known.status, body: { error: known.message } };
  return { status: 400, body: { error: "Something went wrong." } };
}
