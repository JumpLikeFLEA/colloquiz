-- ============================================================
-- 045_publish_lesson_version_check.sql
--
-- AUTH-005. publish_lesson gains a required p_expected_version_id
-- parameter and the same optimistic-concurrency check save_lesson_version
-- already uses (041 §10): both functions determine "latest version"
-- IDENTICALLY —
--   SELECT id FROM lesson_versions WHERE lesson_id = p_lesson_id
--   ORDER BY created_at DESC LIMIT 1
-- — after locking the SAME lessons row FOR UPDATE
-- (`SELECT course_id INTO v_course FROM lessons WHERE id = p_lesson_id FOR
-- UPDATE`), so a publish racing a concurrent save cannot observe a
-- different "latest" than a save started at the same instant would.
--
-- Without this, publish_lesson always published "whatever the latest
-- draft happens to be right now" — it had no way to know which version an
-- author had actually previewed. An author who opened a preview against
-- version A, then had a newer save to version B land (their own edit in
-- another tab, or a co-editor's) before clicking Publish, would silently
-- publish B: content they never previewed. AUTH-005 acceptance: "Publish
-- publishes exactly the version previewed. If a newer draft was saved
-- since preview opened, publish refuses."
--
-- DROP FUNCTION first, not just CREATE OR REPLACE: PostgreSQL overloads
-- functions by argument list, so CREATE OR REPLACE FUNCTION
-- publish_lesson(UUID, UUID, INT) would leave the old two-argument
-- publish_lesson(UUID, INT) in place as a second, still-callable overload
-- rather than replacing it — a caller with a stale client could keep
-- calling the unchecked version indefinitely. Verified with a local
-- `supabase start` + `db reset` replaying every migration from 001, then
-- `\df publish_lesson`: exactly one row, three arguments, printed before
-- this file was handed over.
-- ============================================================

DROP FUNCTION IF EXISTS publish_lesson(UUID, INT);

CREATE OR REPLACE FUNCTION publish_lesson(
  p_lesson_id            UUID,
  p_expected_version_id  UUID,
  p_item_count           INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me         UUID := (SELECT auth.uid());
  v_course     UUID;
  v_latest_id  UUID;
BEGIN
  SELECT course_id INTO v_course FROM lessons WHERE id = p_lesson_id FOR UPDATE;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_item_count IS NULL OR p_item_count < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_item_count');
  END IF;

  SELECT id INTO v_latest_id FROM lesson_versions
  WHERE lesson_id = p_lesson_id
  ORDER BY created_at DESC LIMIT 1;
  IF v_latest_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_draft');
  END IF;

  -- Same IS DISTINCT FROM contract as save_lesson_version's staleness
  -- check (041 §10) — NULL-safe, though p_expected_version_id is never
  -- NULL in practice once a draft exists (there is nothing to have
  -- previewed before then).
  IF p_expected_version_id IS DISTINCT FROM v_latest_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale');
  END IF;

  -- Set from p_expected_version_id, not v_latest_id — they are equal at
  -- this point (the check above just proved it), but writing the
  -- caller-confirmed value rather than the freshly-read one keeps the
  -- statement's intent explicit: publish exactly what was previewed.
  UPDATE lessons
  SET published_version_id = p_expected_version_id,
      published_item_count = p_item_count
  WHERE id = p_lesson_id;

  RETURN jsonb_build_object('ok', true, 'version_id', p_expected_version_id, 'item_count', p_item_count);
END;
$$;

REVOKE ALL ON FUNCTION publish_lesson(UUID, UUID, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION publish_lesson(UUID, UUID, INT) TO authenticated;
