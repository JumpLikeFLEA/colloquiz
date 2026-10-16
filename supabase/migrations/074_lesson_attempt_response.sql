-- ============================================================
-- 074_lesson_attempt_response.sql
--
-- PROG-005 (docs/decisions/0141 Decision 7): store the answer a signed-in
-- learner gave, next to its score.
--
-- Adds:
--   • lesson_attempts.response JSONB, nullable. NULL means "no answer
--     stored": every row written before this migration, and an element a
--     client sent without one (an older local entry) or with one over the cap.
--   • record_lesson_attempts re-emitted from 048, the only migration that
--     defines it (rg over supabase/migrations: 048 defines, 049 only calls
--     it). Two changes, nothing else:
--       - reads an optional `response` per element;
--       - drops ONLY the response of an element whose response::text exceeds
--         lesson_attempt_response_max_bytes(), keeping the score row. The
--         score is the progress record; an oversized or odd answer must not
--         cost the learner it.
--     earned is still capped at possible, and every other drop rule is as 048.
--
-- Read access is unchanged: 048's owner-read policy and GRANT SELECT cover
-- the new column (table-level grant), and there is no write grant, so the RPC
-- stays the only writer. Linked teachers reading answers is TCH-003, not here.
-- Account deletion needs no change: the latest delete_my_account() (061, line
-- 212) already runs DELETE FROM lesson_attempts WHERE user_id = v_me.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================

BEGIN;

ALTER TABLE lesson_attempts ADD COLUMN IF NOT EXISTS response JSONB;

-- The cap is a function so a later change is one re-emit, not a body edit.
-- 4096 bytes is an ASSUMPTION that it clears the longest authored answer
-- (not measured against published lessons); an over-cap answer is dropped, not
-- the score, so a wrong guess costs the answer only.
CREATE OR REPLACE FUNCTION lesson_attempt_response_max_bytes()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 4096 $$;

REVOKE ALL ON FUNCTION lesson_attempt_response_max_bytes() FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION record_lesson_attempts(p_attempts JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me                 UUID := auth.uid();
  v_item                JSONB;
  v_attempt_id           UUID;
  v_lesson_version_id    UUID;
  v_block_id             TEXT;
  v_earned               NUMERIC;
  v_possible             NUMERIC;
  v_response             JSONB;
  v_lesson_id            UUID;
  v_inserted             INT := 0;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  IF p_attempts IS NULL OR jsonb_typeof(p_attempts) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_attempts)
  LOOP
    BEGIN
      v_attempt_id        := NULLIF(v_item->>'attempt_id', '')::UUID;
      v_lesson_version_id := NULLIF(v_item->>'lesson_version_id', '')::UUID;
      v_block_id          := v_item->>'block_id';
      v_earned            := (v_item->>'earned')::NUMERIC;
      v_possible          := (v_item->>'possible')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      -- A UUID or numeric that fails to parse is a malformed element, not a
      -- reason to abort the whole batch.
      CONTINUE;
    END;

    IF v_attempt_id IS NULL OR v_lesson_version_id IS NULL OR v_block_id IS NULL
       OR v_earned IS NULL OR v_possible IS NULL
       OR v_earned < 0 OR v_possible <= 0 THEN
      CONTINUE;
    END IF;

    -- Optional answer. JSON null, a missing key and an over-cap value all
    -- become SQL NULL; the score row is kept either way.
    v_response := v_item->'response';
    IF v_response IS NOT NULL
       AND (jsonb_typeof(v_response) = 'null'
            OR octet_length(v_response::text) > lesson_attempt_response_max_bytes()) THEN
      v_response := NULL;
    END IF;

    SELECT lesson_id INTO v_lesson_id
    FROM lesson_versions WHERE id = v_lesson_version_id;

    IF v_lesson_id IS NULL OR NOT can_read_lesson(v_lesson_id) THEN
      CONTINUE;
    END IF;

    INSERT INTO lesson_attempts (id, user_id, lesson_version_id, block_id, earned, possible, response)
    VALUES (v_attempt_id, v_me, v_lesson_version_id, v_block_id, LEAST(v_earned, v_possible), v_possible, v_response)
    ON CONFLICT (id) DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted);
END;
$$;

REVOKE ALL ON FUNCTION record_lesson_attempts(JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION record_lesson_attempts(JSONB) TO authenticated;

COMMIT;
