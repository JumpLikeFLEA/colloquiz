-- ============================================================
-- 112_notebook.sql — PROG-012 (#329, docs/decisions/0235, 0236, 0238)
--
-- The learner notebook: its two tables, the one copy path, and every read and delete rule.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time and again before
-- commit:
--   latest migration before this one       -> 111_voice_analysis_interim.sql
--   latest body of delete_my_account       -> 109_writing_submissions.sql (re-emitted below,
--     verbatim, with two added DELETEs)
-- Re-emitted bodies, each from its latest definition:
--   voice_analysis_finish   096
--   hide_voice_analysis     096
--   voice_analysis_sweep    097
--   delete_my_account       109
--
-- Lock order (0236 section 2): every path here that touches a take's analysis and its copies
-- locks the voice_submissions row FIRST (KEY SHARE), because submit_voice_recording locks the
-- take and then needs the analysis through the cascade.
--
-- When copies go (0235): a copied row references voice_submissions ON DELETE CASCADE, so a
-- replace removes it and the retention purge (which keeps the take's row, 098) does not.
-- Hiding deletes it explicitly. The learner deletes through the RPCs in section 5.
--
-- Not destructive: the backfill only inserts and stamps the new marker column. Safe to
-- re-apply: IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS; the backfill runs only
-- when notebook_entries did not exist when this transaction started.
-- ============================================================

BEGIN;

SELECT set_config('notebook.first_run', (to_regclass('public.notebook_entries') IS NULL)::text, true);

-- ── 1. Tables ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notebook_entries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind          TEXT        NOT NULL CHECK (kind IN ('said', 'fix', 'own')),
  submission_id UUID        REFERENCES voice_submissions(id) ON DELETE CASCADE,
  course_id     UUID        REFERENCES courses(id) ON DELETE SET NULL,
  lesson_id     UUID        REFERENCES lessons(id) ON DELETE SET NULL,
  -- Titles at write time: a join alone would lose the name once the lesson is unreadable.
  course_title  TEXT,
  lesson_title  TEXT,
  phrase        TEXT,
  -- Trimmed (U+00A0 too), lower-cased, the typographic apostrophes U+2018 U+2019 U+02BC
  -- folded to the straight one. PROG-013 mirrors it.
  phrase_key    TEXT        GENERATED ALWAYS AS (
    lower(btrim(translate(phrase, U&'\2018\2019\02BC', U&'\0027\0027\0027'),
                U&' \0009\000A\000B\000C\000D\00A0'))
  ) STORED,
  quote         TEXT,
  exact         BOOLEAN,
  correction    TEXT,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notebook_entries_own_has_no_take CHECK ((kind = 'own') = (submission_id IS NULL)),
  CONSTRAINT notebook_entries_shape CHECK (
    CASE kind
      WHEN 'said' THEN phrase IS NOT NULL AND quote IS NOT NULL AND exact IS NOT NULL
                       AND correction IS NULL AND note IS NULL
      WHEN 'fix'  THEN quote IS NOT NULL AND correction IS NOT NULL
                       AND phrase IS NULL AND exact IS NULL AND note IS NULL
      ELSE phrase IS NOT NULL AND quote IS NULL AND exact IS NULL AND correction IS NULL
           AND char_length(phrase) BETWEEN 1 AND 200
           AND (note IS NULL OR char_length(note) BETWEEN 1 AND 500)
    END
  )
);
CREATE INDEX IF NOT EXISTS notebook_entries_user_idx ON notebook_entries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notebook_entries_submission_idx ON notebook_entries (submission_id);

CREATE TABLE IF NOT EXISTS notebook_summaries (
  submission_id      UUID        PRIMARY KEY REFERENCES voice_submissions(id) ON DELETE CASCADE,
  user_id            UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id          UUID        REFERENCES courses(id) ON DELETE SET NULL,
  lesson_id          UUID        REFERENCES lessons(id) ON DELETE SET NULL,
  course_title       TEXT,
  lesson_title       TEXT,
  kind               TEXT        NOT NULL CHECK (kind IN ('first', 'final', 'interim')),
  summary            TEXT        NOT NULL,
  next_step          TEXT,
  goal               TEXT,
  taken_at           TIMESTAMPTZ NOT NULL,
  -- The compared take's lesson, for the teacher's read only (0236 pick 2).
  baseline_lesson_id UUID        REFERENCES lessons(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS notebook_summaries_user_idx ON notebook_summaries (user_id, taken_at DESC);

-- No grant: authenticated holds column-level SELECT on this table (096), so it cannot read it.
ALTER TABLE voice_analyses ADD COLUMN IF NOT EXISTS notebook_copied_at TIMESTAMPTZ;

ALTER TABLE notebook_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notebook_summaries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE notebook_entries, notebook_summaries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE notebook_entries, notebook_summaries TO authenticated;

DROP POLICY IF EXISTS "notebook_entries: owner read" ON notebook_entries;
CREATE POLICY "notebook_entries: owner read" ON notebook_entries
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "notebook_summaries: owner read" ON notebook_summaries;
CREATE POLICY "notebook_summaries: owner read" ON notebook_summaries
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));


-- ── 2. The cap on own notes (the 038/096 shape) ─────────────────────────
CREATE OR REPLACE FUNCTION notebook_note_limit()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 1000 $$;
REVOKE ALL ON FUNCTION notebook_note_limit() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION notebook_enforce_note_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('notebook_notes:' || NEW.user_id::text, 0));
  IF (SELECT count(*) FROM notebook_entries WHERE user_id = NEW.user_id AND kind = 'own')
     >= notebook_note_limit() THEN
    RAISE EXCEPTION 'notebook note limit reached (%)', notebook_note_limit()
      USING ERRCODE = 'PT429', DETAIL = 'note_cap';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION notebook_enforce_note_cap() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notebook_note_cap ON notebook_entries;
CREATE TRIGGER notebook_note_cap
  BEFORE INSERT ON notebook_entries
  FOR EACH ROW WHEN (NEW.kind = 'own')
  EXECUTE FUNCTION notebook_enforce_note_cap();


-- ── 3. The copy ─────────────────────────────────────────────────────────
-- An integer JSON number, else NULL (zod's z.number().int()).
CREATE OR REPLACE FUNCTION _notebook_int(p JSONB)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN jsonb_typeof(p) = 'number' THEN
    CASE WHEN (p #>> '{}')::numeric = trunc((p #>> '{}')::numeric) THEN (p #>> '{}')::numeric END
  END
$$;
REVOKE ALL ON FUNCTION _notebook_int(JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION _notebook_text(p JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$ SELECT CASE WHEN jsonb_typeof(p) = 'string' THEN p #>> '{}' END $$;
REVOKE ALL ON FUNCTION _notebook_text(JSONB) FROM PUBLIC, anon, authenticated;

-- A member with a string quote and a well-formed span (parseStored.ts's SpanSchema).
CREATE OR REPLACE FUNCTION _notebook_item_ok(p JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_typeof(p) = 'object'
    AND _notebook_text(p->'quote') IS NOT NULL
    AND _notebook_int(p->'span'->'start') >= 0
    AND _notebook_int(p->'span'->'end') >= 1, FALSE)
$$;
REVOKE ALL ON FUNCTION _notebook_item_ok(JSONB) FROM PUBLIC, anon, authenticated;

-- Whether an item points at its words. The quote must occur in the transcript; the offsets
-- themselves are not compared (UTF-16 units there, code points here; 0236 section 2).
CREATE OR REPLACE FUNCTION _notebook_points(p_transcript TEXT, p JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _notebook_int(p->'span'->'end') > _notebook_int(p->'span'->'start')
     AND p->>'quote' <> ''
     AND strpos(COALESCE(p_transcript, ''), p->>'quote') > 0
$$;
REVOKE ALL ON FUNCTION _notebook_points(TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- Copies one done, shown, not yet copied analysis. TRUE when it copied. Raises when the stored
-- result does not read as an analysis (parseStoredAnalysis returns null), and lets any other
-- error out: callers run it in a subtransaction.
CREATE OR REPLACE FUNCTION _notebook_copy(p_submission_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s        voice_submissions%ROWTYPE;
  v_a        voice_analyses%ROWTYPE;
  v_course   TEXT;
  v_lesson   TEXT;
  v_kind     TEXT;
  v_main     NUMERIC;
  v_compares BOOLEAN;
BEGIN
  SELECT * INTO v_s FROM voice_submissions WHERE id = p_submission_id FOR KEY SHARE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  SELECT * INTO v_a FROM voice_analyses
  WHERE submission_id = p_submission_id
    AND status = 'done' AND hidden_at IS NULL AND notebook_copied_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  IF jsonb_typeof(v_a.result) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'notebook: the stored result is not an analysis';
  END IF;
  v_kind := _notebook_text(v_a.result->'kind');
  IF v_kind IS NULL OR v_kind NOT IN ('first', 'final', 'interim') THEN
    RAISE EXCEPTION 'notebook: the stored result has no kind';
  END IF;
  v_compares := v_kind IN ('final', 'interim');
  v_main     := _notebook_int(v_a.result->'mainError');

  SELECT c.title INTO v_course FROM courses c WHERE c.id = v_s.course_id;
  SELECT l.title INTO v_lesson FROM lessons l WHERE l.id = v_s.lesson_id;

  INSERT INTO notebook_entries (user_id, kind, submission_id, course_id, lesson_id, course_title,
                                lesson_title, phrase, quote, exact, created_at, updated_at)
  SELECT v_s.user_id, 'said', v_s.id, v_s.course_id, v_s.lesson_id, v_course, v_lesson,
         e->>'expression', e->>'quote', (e->>'exact')::boolean, v_s.submitted_at, v_s.submitted_at
  FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(v_a.result->'expressionsUsed') = 'array'
              THEN v_a.result->'expressionsUsed' ELSE '[]'::jsonb END
       ) WITH ORDINALITY x(e, n)
  WHERE CASE WHEN _notebook_item_ok(e)
                  AND jsonb_typeof(e->'expression') = 'string'
                  AND jsonb_typeof(e->'exact') = 'boolean'
             THEN _notebook_points(v_a.transcript, e) ELSE FALSE END
  ORDER BY n;

  -- mainError indexes the well-formed errors (parseStored.ts drops the others first), and the
  -- one it names must point at its words.
  INSERT INTO notebook_entries (user_id, kind, submission_id, course_id, lesson_id, course_title,
                                lesson_title, quote, correction, created_at, updated_at)
  SELECT v_s.user_id, 'fix', v_s.id, v_s.course_id, v_s.lesson_id, v_course, v_lesson,
         e->>'quote', e->>'correction', v_s.submitted_at, v_s.submitted_at
  FROM (
    SELECT e, row_number() OVER (ORDER BY n) - 1 AS i
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(v_a.result->'errors') = 'array'
                THEN v_a.result->'errors' ELSE '[]'::jsonb END
         ) WITH ORDINALITY x(e, n)
    WHERE CASE WHEN _notebook_item_ok(e)
                    AND jsonb_typeof(e->'correction') = 'string'
                    AND jsonb_typeof(e->'explanation') = 'string'
                    AND jsonb_typeof(e->'category') = 'string'
               THEN e->>'category' IN ('grammar', 'vocabulary', 'word_order', 'collocation', 'other')
               ELSE FALSE END
  ) ok
  WHERE ok.i = v_main AND _notebook_points(v_a.transcript, ok.e);

  INSERT INTO notebook_summaries (submission_id, user_id, course_id, lesson_id, course_title,
                                  lesson_title, kind, summary, next_step, goal, taken_at,
                                  baseline_lesson_id)
  VALUES (
    v_s.id, v_s.user_id, v_s.course_id, v_s.lesson_id, v_course, v_lesson, v_kind,
    COALESCE(_notebook_text(v_a.result->'summary'), ''),
    CASE WHEN v_compares THEN _notebook_text(v_a.result->'nextStep') END,
    CASE WHEN NOT v_compares THEN _notebook_text(v_a.result->'goal') END,
    v_s.submitted_at,
    CASE WHEN v_compares THEN
      (SELECT b.lesson_id FROM voice_submissions b WHERE b.id = v_a.baseline_submission_id)
    END
  );

  UPDATE voice_analyses SET notebook_copied_at = now() WHERE submission_id = p_submission_id;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION _notebook_copy(UUID) FROM PUBLIC, anon, authenticated;

-- Every done, shown analysis whose marker is NULL, each in its own subtransaction, so a row
-- that never parses stops neither the others nor the caller. Returns how many it copied.
CREATE OR REPLACE FUNCTION _notebook_copy_missing()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_n  INTEGER := 0;
BEGIN
  FOR v_id IN
    SELECT submission_id FROM voice_analyses
    WHERE status = 'done' AND hidden_at IS NULL AND notebook_copied_at IS NULL
    ORDER BY submission_id
  LOOP
    BEGIN
      IF _notebook_copy(v_id) THEN v_n := v_n + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notebook copy failed for %: % (%)', v_id, SQLERRM, SQLSTATE;
    END;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION _notebook_copy_missing() FROM PUBLIC, anon, authenticated;


-- ── 4. finish, hide, sweep (re-emitted) ─────────────────────────────────
-- 096's body, plus: the take is locked first, and a finished analysis is copied in a
-- subtransaction. A failed copy leaves the analysis done and the marker NULL; the sweep
-- recovers it.
CREATE OR REPLACE FUNCTION voice_analysis_finish(
  p_submission_id  UUID,
  p_transcript     TEXT,
  p_result         JSONB,
  p_instruction    TEXT,
  p_prompt_version TEXT,
  p_model          TEXT,
  p_usage          JSONB,
  p_baseline       UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_done BOOLEAN;
BEGIN
  PERFORM 1 FROM voice_submissions WHERE id = p_submission_id FOR KEY SHARE;

  UPDATE voice_analyses
     SET status                 = 'done',
         transcript             = p_transcript,
         result                 = p_result,
         instruction            = p_instruction,
         prompt_version         = p_prompt_version,
         model                  = p_model,
         usage                  = p_usage,
         baseline_submission_id = (SELECT s.id FROM voice_submissions s WHERE s.id = p_baseline),
         lease_until            = NULL,
         failure                = NULL,
         updated_at             = now(),
         finished_at            = now()
   WHERE submission_id = p_submission_id
     AND status IN ('pending', 'transcribing', 'analysing');
  v_done := FOUND;

  IF v_done THEN
    BEGIN
      PERFORM _notebook_copy(p_submission_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notebook copy failed for %: % (%)', p_submission_id, SQLERRM, SQLSTATE;
    END;
  END IF;
  RETURN v_done;
END;
$$;

REVOKE ALL ON FUNCTION voice_analysis_finish(UUID, TEXT, JSONB, TEXT, TEXT, TEXT, JSONB, UUID)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION voice_analysis_finish(UUID, TEXT, JSONB, TEXT, TEXT, TEXT, JSONB, UUID)
  TO service_role;


-- 096's body, plus the take's lock and two DELETEs. After the purge the analysis row is gone,
-- so this answers 'forbidden' and only the learner can delete the copies (0235).
CREATE OR REPLACE FUNCTION hide_voice_analysis(p_submission_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_course UUID;
  v_a      voice_analyses%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  -- Not found and not an editor read the same, so a non-editor cannot probe which
  -- submission ids have an analysis.
  SELECT s.course_id INTO v_course
  FROM voice_submissions s
  JOIN voice_analyses a ON a.submission_id = s.id
  WHERE s.id = p_submission_id;
  IF v_course IS NULL OR NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008 (083): a lapsed seat reads but does not write. After the editor check.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;

  -- PROG-012: the take first (lock order).
  PERFORM 1 FROM voice_submissions WHERE id = p_submission_id FOR KEY SHARE;
  SELECT * INTO v_a FROM voice_analyses WHERE submission_id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF v_a.hidden_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_hidden', true);
  END IF;
  IF v_a.status <> 'done' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_done');
  END IF;

  UPDATE voice_analyses
     SET hidden_at = now(), hidden_by = v_me, updated_at = now()
   WHERE submission_id = p_submission_id;
  UPDATE voice_analysis_sends
     SET counted = FALSE, uncounted_reason = 'hidden', uncounted_at = now()
   WHERE id = v_a.send_id AND counted;
  -- PROG-012 (0235): hiding removes what the notebook copied from this analysis.
  DELETE FROM notebook_entries   WHERE submission_id = p_submission_id;
  DELETE FROM notebook_summaries WHERE submission_id = p_submission_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION hide_voice_analysis(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION hide_voice_analysis(UUID) TO authenticated;


-- 097's body, plus the takes' lock and the recovery. Same return value.
CREATE OR REPLACE FUNCTION voice_analysis_sweep(p_age INTERVAL DEFAULT INTERVAL '24 hours')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out JSONB;
BEGIN
  -- PROG-012: the takes first (lock order), then 097's update.
  PERFORM 1
  FROM voice_submissions s
  WHERE s.id IN (
    SELECT a.submission_id FROM voice_analyses a
    WHERE a.status IN ('pending', 'transcribing', 'analysing') AND a.created_at < now() - p_age
  )
  ORDER BY s.id
  FOR KEY SHARE;

  WITH stuck AS (
    UPDATE voice_analyses
       SET status = 'failed', failure = 'timeout', lease_until = NULL,
           updated_at = now(), finished_at = now()
     WHERE status IN ('pending', 'transcribing', 'analysing')
       AND created_at < now() - p_age
    RETURNING submission_id, send_id, stt_job_id
  ), given_back AS (
    UPDATE voice_analysis_sends s
       SET counted = FALSE, uncounted_reason = 'failed', uncounted_at = now()
      FROM stuck
     WHERE s.id = stuck.send_id AND s.counted
    RETURNING s.id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('submission_id', submission_id, 'stt_job_id', stt_job_id)), '[]'::jsonb)
    INTO v_out
    FROM stuck;

  -- PROG-012: the copy's recovery.
  PERFORM _notebook_copy_missing();
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION voice_analysis_sweep(INTERVAL) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION voice_analysis_sweep(INTERVAL) TO service_role;


-- ── 5. The learner's writes ─────────────────────────────────────────────
-- Own notes only; copied text is never edited. p_lesson_id is recorded with its titles only when
-- the caller can read that lesson, so a title cannot be read through a snapshot.
CREATE OR REPLACE FUNCTION _notebook_trim(p TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$ SELECT btrim(p, U&' \0009\000A\000B\000C\000D\00A0') $$;
REVOKE ALL ON FUNCTION _notebook_trim(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION _notebook_note_error(p_phrase TEXT, p_note TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_phrase IS NULL OR p_phrase = '' THEN 'phrase_empty'
    WHEN char_length(p_phrase) > 200       THEN 'phrase_too_long'
    WHEN char_length(p_note) > 500         THEN 'note_too_long'
  END
$$;
REVOKE ALL ON FUNCTION _notebook_note_error(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION notebook_add_note(p_phrase TEXT, p_note TEXT DEFAULT NULL, p_lesson_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_phrase TEXT := _notebook_trim(p_phrase);
  v_note   TEXT := NULLIF(_notebook_trim(p_note), '');
  v_err    TEXT;
  v_course UUID;
  v_ctitle TEXT;
  v_ltitle TEXT;
  v_id     UUID;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  v_err := _notebook_note_error(v_phrase, v_note);
  IF v_err IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_err);
  END IF;
  IF p_lesson_id IS NOT NULL THEN
    -- Unknown and unreadable read the same.
    IF NOT can_read_lesson(p_lesson_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_readable');
    END IF;
    SELECT c.id, c.title, l.title INTO v_course, v_ctitle, v_ltitle
    FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.id = p_lesson_id;
  END IF;

  INSERT INTO notebook_entries (user_id, kind, course_id, lesson_id, course_title, lesson_title, phrase, note)
  VALUES (v_me, 'own', v_course, p_lesson_id, v_ctitle, v_ltitle, v_phrase, v_note)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION notebook_add_note(TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION notebook_add_note(TEXT, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION notebook_edit_note(p_id UUID, p_phrase TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_phrase TEXT := _notebook_trim(p_phrase);
  v_note   TEXT := NULLIF(_notebook_trim(p_note), '');
  v_err    TEXT;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  v_err := _notebook_note_error(v_phrase, v_note);
  IF v_err IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_err);
  END IF;
  UPDATE notebook_entries SET phrase = v_phrase, note = v_note, updated_at = now()
  WHERE id = p_id AND user_id = v_me AND kind = 'own';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION notebook_edit_note(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION notebook_edit_note(UUID, TEXT, TEXT) TO authenticated;

-- A said phrase is shown merged by (course, phrase_key), so deleting it deletes the caller's
-- rows of every take (0236 section 4). A fix or an own note is one row.
CREATE OR REPLACE FUNCTION notebook_delete_entry(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_e  notebook_entries%ROWTYPE;
  v_n  INTEGER;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  SELECT * INTO v_e FROM notebook_entries WHERE id = p_id AND user_id = v_me;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  DELETE FROM notebook_entries e
  WHERE e.user_id = v_me
    AND (e.id = p_id
         OR (v_e.kind = 'said' AND e.kind = 'said'
             AND e.course_id IS NOT DISTINCT FROM v_e.course_id
             AND e.phrase_key = v_e.phrase_key));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', v_n);
END;
$$;
REVOKE ALL ON FUNCTION notebook_delete_entry(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION notebook_delete_entry(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION notebook_delete_summary(p_submission_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  DELETE FROM notebook_summaries WHERE submission_id = p_submission_id AND user_id = v_me;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION notebook_delete_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION notebook_delete_summary(UUID) TO authenticated;


-- ── 6. Reads ────────────────────────────────────────────────────────────
-- One JSONB value, because PostgREST cuts a plain select at 1,000 rows (0236 section 1).
-- SECURITY INVOKER: RLS decides the rows; the filter keeps the index in play.
CREATE OR REPLACE FUNCTION my_notebook()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'entries', COALESCE((
      SELECT jsonb_agg(to_jsonb(e) - 'user_id' ORDER BY e.created_at DESC, e.id)
      FROM notebook_entries e WHERE e.user_id = (SELECT auth.uid())), '[]'::jsonb),
    'summaries', COALESCE((
      SELECT jsonb_agg(to_jsonb(s) - 'user_id' - 'baseline_lesson_id' ORDER BY s.taken_at DESC, s.submission_id)
      FROM notebook_summaries s WHERE s.user_id = (SELECT auth.uid())), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION my_notebook() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_notebook() TO authenticated;

-- The linked teacher's view (0236 section 5, pick 2): copied rows only, per readable lesson. A
-- final or interim summary also needs its baseline's lesson, stored and readable. What is not
-- returned leaves nothing behind.
CREATE OR REPLACE FUNCTION linked_student_notebook(p_student UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ok AS MATERIALIZED (
    SELECT rl.lesson_id
    FROM _teacher_readable_lessons((SELECT auth.uid()), p_student) rl
    WHERE _is_teacher((SELECT auth.uid()))
      AND _teacher_linked((SELECT auth.uid()), p_student)
      AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = p_student AND p.deleted_at IS NULL)
  )
  SELECT jsonb_build_object(
    'entries', COALESCE((
      SELECT jsonb_agg(to_jsonb(e) - 'user_id' - 'submission_id' - 'note' ORDER BY e.created_at DESC, e.id)
      FROM notebook_entries e
      WHERE e.user_id = p_student
        AND e.submission_id IS NOT NULL
        AND e.kind IN ('said', 'fix')
        AND e.lesson_id IN (SELECT lesson_id FROM ok)), '[]'::jsonb),
    'summaries', COALESCE((
      SELECT jsonb_agg(to_jsonb(s) - 'user_id' - 'submission_id' - 'baseline_lesson_id'
                       ORDER BY s.taken_at DESC, s.submission_id)
      FROM notebook_summaries s
      WHERE s.user_id = p_student
        AND s.lesson_id IN (SELECT lesson_id FROM ok)
        AND (s.kind = 'first' OR s.baseline_lesson_id IN (SELECT lesson_id FROM ok))), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION linked_student_notebook(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION linked_student_notebook(UUID) TO authenticated;

-- To try (0236 section 6). No argument: it answers for the caller's own started courses only
-- (an open, an attempt or a take). has_before is TRUE, fail-closed, for a course that is neither
-- published nor entitled to the caller. before_taken reads each take's own version's document,
-- so a republish that changed the block's id does not re-hide the list.
CREATE OR REPLACE FUNCTION notebook_try_gate()
RETURNS TABLE (course_id UUID, has_before BOOLEAN, before_taken BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS id),
  started AS (
    SELECT l.course_id AS cid FROM lesson_opens o JOIN lessons l ON l.id = o.lesson_id
    WHERE o.user_id = (SELECT id FROM me)
    UNION
    SELECT l.course_id FROM lesson_attempts a
    JOIN lesson_versions v ON v.id = a.lesson_version_id
    JOIN lessons l ON l.id = v.lesson_id
    WHERE a.user_id = (SELECT id FROM me)
    UNION
    SELECT s.course_id FROM voice_submissions s WHERE s.user_id = (SELECT id FROM me)
  )
  SELECT c.id,
    CASE WHEN c.status = 'published' OR has_course_entitlement(c.id) THEN
      EXISTS (
        SELECT 1
        FROM lessons l
        JOIN lesson_versions v ON v.id = l.published_version_id
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(v.document) = 'array' THEN v.document ELSE '[]'::jsonb END) b
        WHERE l.course_id = c.id AND l.archived_at IS NULL
          AND b->>'kind' = 'task' AND b->>'type' = 'voice' AND b->>'compare' = 'before'
      )
    ELSE TRUE END,
    EXISTS (
      SELECT 1
      FROM voice_submissions s
      JOIN lesson_versions v ON v.id = s.lesson_version_id
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(v.document) = 'array' THEN v.document ELSE '[]'::jsonb END) b
      WHERE s.user_id = (SELECT id FROM me) AND s.course_id = c.id
        AND b->>'id' = s.block_id
        AND b->>'kind' = 'task' AND b->>'type' = 'voice' AND b->>'compare' = 'before'
    )
  FROM started st JOIN courses c ON c.id = st.cid;
$$;
REVOKE ALL ON FUNCTION notebook_try_gate() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION notebook_try_gate() TO authenticated;


-- ── 7. delete_my_account (re-emitted from 109) ──────────────────────────
CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := auth.uid();
  v_blocking JSONB;
  v_voice    TEXT[];
  v_imp_objs TEXT[];
  v_imp_files TEXT[];
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name))
    INTO v_blocking
  FROM groups g
  WHERE g.owner_id = v_me
    AND EXISTS (
      SELECT 1 FROM group_members m
      WHERE m.group_id = g.id AND m.user_id <> v_me
    );

  IF v_blocking IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'owns_groups', 'groups', v_blocking);
  END IF;

  DELETE FROM groups g
  WHERE g.owner_id = v_me
    AND NOT EXISTS (
      SELECT 1 FROM group_members m
      WHERE m.group_id = g.id AND m.user_id <> v_me
    );

  DELETE FROM group_members WHERE user_id = v_me;

  -- Every object under the caller's segment, sent or not.
  SELECT COALESCE(array_agg(o.name ORDER BY o.name), ARRAY[]::TEXT[])
    INTO v_voice
  FROM storage.objects o
  WHERE o.bucket_id = 'voice-recordings'
    AND (storage.foldername(o.name))[2] = v_me::text;
  INSERT INTO voice_object_deletions (object_name, reason)
  SELECT unnest(v_voice), 'account_deleted'
  ON CONFLICT (object_name) DO NOTHING;

  DELETE FROM voice_feedback f
  USING voice_submissions s
  WHERE s.id = f.submission_id AND s.user_id = v_me;
  -- PROG-012 (0235): the notebook, own notes and summaries included. The profile row stays, so
  -- the ON DELETE CASCADE from profiles would never fire.
  DELETE FROM notebook_entries         WHERE user_id = v_me;
  DELETE FROM notebook_summaries       WHERE user_id = v_me;
  DELETE FROM voice_submissions        WHERE user_id = v_me;
  -- WRITE-002 (0225 Decision 10): written answers and the feedback on them.
  DELETE FROM writing_feedback f
  USING writing_submissions s
  WHERE s.id = f.submission_id AND s.user_id = v_me;
  DELETE FROM writing_submissions      WHERE user_id = v_me;
  -- VOICE-011: the send ledger. The profile row stays, so its ON DELETE CASCADE never fires;
  -- analyses went with the takes above.
  DELETE FROM voice_analysis_sends     WHERE user_id = v_me;
  DELETE FROM run_final_comments       WHERE user_id = v_me;
  -- CNT-018 (docs/decisions/0203): the caller's course imports. The profile row stays, so the
  -- ON DELETE CASCADE would never fire. What the rows and the bucket still hold is returned
  -- for the route to remove (the voice_objects pattern); the daily sweep catches what fails.
  SELECT COALESCE(array_agg(o.name ORDER BY o.name), ARRAY[]::TEXT[])
    INTO v_imp_objs
  FROM storage.objects o
  WHERE o.bucket_id = 'course-imports'
    AND (storage.foldername(o.name))[1] = v_me::text;
  SELECT COALESCE(array_agg(c.anthropic_file_id), ARRAY[]::TEXT[])
    INTO v_imp_files
  FROM course_imports c
  WHERE c.user_id = v_me AND c.anthropic_file_id IS NOT NULL;
  DELETE FROM course_imports           WHERE user_id = v_me;

  DELETE FROM notifications            WHERE user_id = v_me;
  DELETE FROM notification_preferences WHERE user_id = v_me;
  DELETE FROM quiz_sessions            WHERE user_id = v_me;
  DELETE FROM lesson_attempts          WHERE user_id = v_me;
  DELETE FROM signup_acquisitions      WHERE user_id = v_me;
  DELETE FROM lesson_opens             WHERE user_id = v_me;
  DELETE FROM run_invites              WHERE claimed_by = v_me;
  DELETE FROM run_enrolments           WHERE user_id = v_me;
  DELETE FROM course_entitlements      WHERE user_id = v_me;
  -- TCH-001 (privacy-policy.md §9: "then deleted outright").
  DELETE FROM teacher_student_links    WHERE student_id = v_me OR teacher_id = v_me;
  DELETE FROM teacher_join_tokens      WHERE teacher_id = v_me;
  -- TCH-002: the caller's own groups (memberships cascade). Memberships of the
  -- caller as a student go with the link deletes above (trigger, section 3).
  DELETE FROM teacher_groups           WHERE teacher_id = v_me;
  -- TCH-004 (0144 Q4; privacy-policy.md §9): every conversation the caller is a
  -- party to, both sides. Messages (and anything a later card hangs off them)
  -- go with the conversation by ON DELETE CASCADE.
  DELETE FROM teacher_conversations    WHERE student_id = v_me OR teacher_id = v_me;
  -- TCH-005 (privacy-policy.md §9: "removed from the teacher's groups and homework"):
  -- the caller's own assignments (targets cascade) and, as a student, their direct
  -- targets. Group-derived homework ended with the 077 membership trigger.
  DELETE FROM homework_assignments     WHERE teacher_id = v_me;
  DELETE FROM homework_targets         WHERE student_id = v_me;
  -- TCH-007 (0154 Decision 8): the caller's seat, with its public name and the
  -- admin's notes. The profile row stays, so the cascade would not remove it.
  DELETE FROM author_seats             WHERE user_id = v_me;
  -- COH-016 (privacy-policy.md section 9: "delete your calendar feed token"). The profile
  -- row stays, so the ON DELETE CASCADE on the token table would never fire.
  DELETE FROM calendar_feed_tokens     WHERE user_id = v_me;
  -- COH-010 (privacy-policy.md section 9: "your Telegram chat id"). The profile row
  -- stays, so the ON DELETE CASCADE on these tables would never fire.
  DELETE FROM telegram_link_tokens     WHERE user_id = v_me;
  DELETE FROM telegram_links           WHERE user_id = v_me;

  UPDATE profiles
     SET full_name           = NULL,
         city                = NULL,
         display_name        = 'Deleted user',
         avatar_url          = NULL,
         leaderboard_opt_out = TRUE,
         deleted_at          = now()
   WHERE id = v_me;

  RETURN jsonb_build_object('ok', true, 'voice_objects', to_jsonb(v_voice),
                            'import_objects', to_jsonb(v_imp_objs), 'import_files', to_jsonb(v_imp_files));
END;
$$;

REVOKE ALL ON FUNCTION delete_my_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;


-- ── 8. Backfill, once ───────────────────────────────────────────────────
DO $$
DECLARE
  v_n INTEGER;
BEGIN
  IF current_setting('notebook.first_run', true) = 'true' THEN
    v_n := _notebook_copy_missing();
    RAISE NOTICE 'notebook backfill: % copied of % done and shown', v_n,
      (SELECT count(*) FROM voice_analyses WHERE status = 'done' AND hidden_at IS NULL);
  ELSE
    RAISE NOTICE 'notebook backfill skipped: the table already existed';
  END IF;
END;
$$;

COMMIT;
