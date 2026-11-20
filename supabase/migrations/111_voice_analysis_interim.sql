-- ============================================================
-- 111_voice_analysis_interim.sql — VOICE-017 (docs/decisions/0229)
--
-- voice_analyses.instruction was CHECK (instruction IN ('first', 'final')) (096). The
-- end of a free first lesson gets a third instruction, 'interim'. This re-creates that
-- one CHECK (named voice_analyses_instruction_check by Postgres at 096) to allow it.
-- Nothing else changes: no column, no grant, no policy, no function body.
--
-- Written, not applied to hosted. Safe to re-apply: DROP CONSTRAINT IF EXISTS, then ADD.
-- Verify: supabase/verify/111_voice_analysis_interim.sql.
-- ============================================================

BEGIN;

ALTER TABLE voice_analyses DROP CONSTRAINT IF EXISTS voice_analyses_instruction_check;
ALTER TABLE voice_analyses
  ADD CONSTRAINT voice_analyses_instruction_check
  CHECK (instruction IN ('first', 'final', 'interim'));

COMMIT;
