-- ============================================================
-- 027_admin_profile_read.sql
--
-- Lets an admin read any profile row.
--
-- WHY: Admin > Feedback names the sender by embedding
-- feedback.user_id -> profiles. The embed is evaluated under the CALLER's
-- privileges, and until now `profiles` had exactly three SELECT policies —
-- "owner read/write" (001), "linked read" (006, tutor <-> student) and
-- "group co-member read" (014). An admin is none of those things to a stranger,
-- so every queue row except the admin's own resolved to NULL and rendered as
-- "Unknown user". The feedback is readable but unattributable, which for a
-- triage queue is most of the value gone.
--
-- ⚠ THE HELPER IS NOT OPTIONAL — IT IS WHAT AVOIDS INFINITE RECURSION.
-- The obvious spelling of this policy,
--     USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
--                    AND role = 'admin'))
-- is a policy ON profiles that SELECTs FROM profiles. That inner read is itself
-- subject to this same policy, and Postgres aborts every query against the
-- table with "infinite recursion detected in policy for relation profiles".
-- A SECURITY DEFINER function runs as its owner, for whom RLS is not applied,
-- which breaks the cycle. This is exactly why 014's co-member policy calls
-- shares_group_with() instead of inlining its subquery — same trap, same fix.
--
-- WHY A POLICY AND NOT AN RPC: 016 deliberately used SECURITY DEFINER functions
-- rather than widening this table, and that reasoning still stands — but it is
-- specifically about not exposing every profile column to EVERY user, which is
-- what a public leaderboard would have needed. This grants the same visibility
-- to admins only, who already read the whole question bank, every user report
-- and now every piece of feedback. Nothing here widens what a normal user sees.
--
-- SCOPE: SELECT only. Admins still cannot UPDATE another profile through
-- PostgREST — 006 revoked blanket UPDATE in favour of a column allow-list, and
-- that is untouched. In particular this does NOT let an admin edit anyone's
-- role from a user session.
--
-- NOT A LEADERBOARD CHANGE. The standing rule that public surfaces render
-- display_name and never full_name is about what is PUBLISHED; it is unaffected
-- by who may read the table. The admin queue shows full_name because
-- identifying the sender is the entire point of a moderation surface.
--
-- Safe to re-apply: idempotent.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================

-- Is this user an admin? SECURITY DEFINER so it can read profiles.role without
-- re-entering the policy that calls it. STABLE so the planner evaluates it once
-- per statement rather than once per row.
CREATE OR REPLACE FUNCTION is_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_user_id AND role = 'admin'
  );
$$;

-- Evaluated inside a profiles SELECT policy, so every role that reads profiles
-- needs EXECUTE — including anon, which reads profiles through the public
-- subject/stats path. For anon auth.uid() is NULL and this simply returns
-- false. Mirrors the grant block in 014.
GRANT EXECUTE ON FUNCTION is_admin(UUID) TO anon, authenticated;

DROP POLICY IF EXISTS "profiles: admin read" ON profiles;
CREATE POLICY "profiles: admin read"
  ON profiles FOR SELECT
  USING (is_admin(auth.uid()));
