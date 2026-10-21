-- ============================================================
-- 095_terms_1_3.sql
--
-- OPS-026, docs/decisions/0184, 0095 Decision 4. Terms 1.3 adds "Voice tasks
-- and AI feedback" to section 4. Only current_terms_version() changes;
-- handle_new_user() is not re-emitted (054).
--
-- The version returned here MUST equal the "Version X.Y" header of
-- docs/release/legal/terms-of-service.md (scripts/check-terms-version.mjs).
-- Not material (a feature described, nothing taken away), so no 14-day
-- notice (Terms section 10). The privacy change is the material one (0184).
-- Existing profiles keep the version they accepted.
--
-- Written, not applied. Apply only once the owner has published OPS-026's
-- text; applying it earlier stamps new signups 1.3 against a Terms page the
-- owner has not yet released.
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_terms_version()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$ SELECT '1.3'::text $$;
