import { createClient } from "@supabase/supabase-js";

/**
 * A session-less Supabase client: the anon key and no cookies, so every
 * query runs as `anon` whoever is signed in. AUTH-009's "Visitor view" uses
 * it to read a lesson the way an anonymous visitor does, through the same
 * RLS and `lesson_state` (055). Server-side only by convention; it carries no
 * secret (the anon key is already public), but it must never be used where
 * the caller's own identity should apply.
 */
export function createAnonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
