-- ============================================================
-- 072_terms_1_2.sql
--
-- OPS-024, docs/decisions/0144, 0095 Decision 4. Terms 1.2 adds "messages"
-- to the section 5 conduct rule. Only current_terms_version() changes;
-- handle_new_user() is not re-emitted (054).
--
-- The version returned here MUST equal the "Version X.Y" header of
-- docs/release/legal/terms-of-service.md (scripts/check-terms-version.mjs).
-- Not material (a conduct rule widened, nothing taken away), so no 14-day
-- notice (Terms section 10). Existing profiles keep the version they
-- accepted; production has no real accounts (0144 Q1).
--
-- Written, not applied. Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_terms_version()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$ SELECT '1.2'::text $$;
