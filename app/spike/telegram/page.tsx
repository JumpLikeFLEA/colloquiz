"use client";

// ANON-010 spike — NEVER MERGED. Branch spike/anon-010 only.
// Signs in through the custom:telegram provider and prints the identities.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function TelegramSpike() {
  const [out, setOut] = useState<string>("loading…");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    // detectSessionInUrl exchanges ?code= (PKCE) on client creation; getUser
    // waits for that to settle.
    supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
        setOut("not signed in");
        return;
      }
      const u = data.user;
      setOut(
        JSON.stringify(
          { id: u.id, email: u.email ?? null, phone: u.phone ?? null, created_at: u.created_at, app_metadata: u.app_metadata, user_metadata: u.user_metadata, identities: u.identities },
          null,
          2,
        ),
      );
    });
  }, []);

  async function signIn() {
    setErr(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "custom:telegram" as never,
      options: { redirectTo: `${window.location.origin}/spike/telegram` },
    });
    if (error) setErr(error.message);
  }

  async function signOut() {
    await createClient().auth.signOut();
    setOut("signed out");
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold">ANON-010 Telegram spike</h1>
      <div className="flex gap-3">
        <button type="button" onClick={signIn} className="rounded-xl bg-brand px-4 py-2 text-white">
          Sign in with Telegram
        </button>
        <button type="button" onClick={signOut} className="rounded-xl border px-4 py-2">
          Sign out
        </button>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <pre className="overflow-x-auto rounded-xl bg-muted p-3 text-xs">{out}</pre>
    </main>
  );
}
