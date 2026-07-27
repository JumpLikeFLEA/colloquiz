-- ============================================================
-- 022_avatars.sql
--
-- Settings > Account: profile avatars.
--
-- Adds profiles.avatar_url and an "avatars" storage bucket. The bucket is
-- PUBLIC: an avatar is shown next to a display name on leaderboards and group
-- rosters, so it is already visible to anyone who can see the account. Public
-- also means a plain, cacheable URL — no signed-URL refresh on every render.
--
-- The size and type limits live on the BUCKET, not only in the client. The UI
-- states them before the file picker opens and rejects a bad file without a
-- round trip, but a hand-rolled request bypasses that; these two settings are
-- what actually enforces it.
--
-- Object naming is "<user_id>/<uuid>.<ext>": the first path segment is the
-- owner, which is what the policies below key on, and the uuid makes every
-- upload a new URL so a replaced avatar is never served stale from a CDN. The
-- app deletes the previous object after a successful replace.
--
-- Safe to re-apply: IF NOT EXISTS / ON CONFLICT / DROP POLICY IF EXISTS.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================

-- NOTE: adding the column is not enough to make it writable — 006 revoked
-- blanket UPDATE on profiles in favour of a column-level allow-list. The
-- matching GRANT lives in 023; apply both.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ── bucket ───────────────────────────────────────────────────────────────────
-- 2 MB, raster image types only. Keep these in sync with lib/avatar.ts, which
-- states the same limits in the UI.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  TRUE,
  2097152,                                              -- 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── object policies ──────────────────────────────────────────────────────────
-- storage.objects already has RLS enabled by Supabase; these add the avatars
-- rules. Writes are scoped to a folder named for the caller's uid, so one user
-- can never overwrite or delete another's avatar.

DROP POLICY IF EXISTS "avatars: public read" ON storage.objects;
CREATE POLICY "avatars: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars: owner insert" ON storage.objects;
CREATE POLICY "avatars: owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars: owner update" ON storage.objects;
CREATE POLICY "avatars: owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars: owner delete" ON storage.objects;
CREATE POLICY "avatars: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
