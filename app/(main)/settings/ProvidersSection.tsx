"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserIdentity } from "@supabase/supabase-js";
import { Check, KeyRound, Loader2, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { ErrorDialog } from "@/app/components/ErrorDialog";
import { GoogleIcon, DiscordIcon } from "@/app/components/ProviderIcons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";

// The sign-in methods this app offers. Rendered in this fixed order so the list
// does not reshuffle as identities are linked and unlinked.
const PROVIDERS = [
  { id: "email", label: "Email & password", icon: <KeyRound size={18} className="text-muted-foreground" />, oauth: false },
  { id: "google", label: "Google", icon: <GoogleIcon size={18} />, oauth: true },
  { id: "discord", label: "Discord", icon: <DiscordIcon size={18} />, oauth: true },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

/**
 * Linked sign-in methods, read from Supabase's identities rather than inferred
 * from the profile or the app's own state — identities are the only record of
 * what can actually sign this account in.
 *
 * THE RULE: the last remaining identity can never be disconnected. Supabase
 * rejects it server-side too, but a request that always fails is not a control
 * — the action is disabled with the reason stated in the row.
 */
export function ProvidersSection({
  identities,
  loadError,
}: {
  /** Fetched server-side in page.tsx, so the list is correct on first paint. */
  identities: UserIdentity[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<{ identity: UserIdentity; label: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Counts every identity, not just the three this app renders: an account
  // linked to a provider we no longer show still has a way in, and unlinking a
  // visible one would not lock anybody out.
  const isLastMethod = identities.length <= 1;

  async function handleConnect(provider: ProviderId) {
    setBusy(provider);
    const supabase = createClient();
    const { error } = await supabase.auth.linkIdentity({
      provider: provider as "google" | "discord",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/settings` },
    });
    // On success the browser navigates to the provider; only failures land here.
    if (error) {
      setBusy(null);
      setActionError(
        `${error.message}\n\nLinking an extra sign-in method also requires "Manual linking" to be enabled for the Supabase project.`,
      );
    }
  }

  async function handleUnlink(identity: UserIdentity) {
    setConfirmUnlink(null);
    setBusy(identity.provider as ProviderId);
    const supabase = createClient();
    const { error } = await supabase.auth.unlinkIdentity(identity);
    setBusy(null);
    if (error) { setActionError(error.message); return; }
    toast.success("Sign-in method disconnected");
    // The list came from the server, so re-render it there rather than keeping
    // a second copy in client state that could drift.
    router.refresh();
  }

  return (
    <>
      <div className="rounded-2xl border border-border bg-card divide-y divide-border">
        {loadError && (
          <p className="px-5 py-4 text-sm text-destructive">
            Couldn’t load your sign-in methods: {loadError}
          </p>
        )}

        {PROVIDERS.map(provider => {
          const identity = identities.find(i => i.provider === provider.id);
          const connected = !!identity;
          const working = busy === provider.id;
          // Only a connected method can be the last one, so the guard only ever
          // disables a Disconnect — never a Connect.
          const blockedAsLast = connected && isLastMethod;

          return (
            <div key={provider.id} className="flex items-center gap-4 p-5">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted shrink-0">
                {provider.icon}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{provider.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {connected ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <Check size={12} />
                      Connected{identity.identity_data?.email ? ` · ${String(identity.identity_data.email)}` : ""}
                    </span>
                  ) : (
                    "Not connected"
                  )}
                </p>
                {blockedAsLast && (
                  <p className="text-xs text-muted-foreground mt-1">
                    This is your only sign-in method. Connect another one before disconnecting it.
                  </p>
                )}
                {!connected && !provider.oauth && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Added by signing up with an email and password.
                  </p>
                )}
              </div>

              {connected ? (
                <button
                  type="button"
                  onClick={() => setConfirmUnlink({ identity, label: provider.label })}
                  disabled={blockedAsLast || working}
                  aria-describedby={blockedAsLast ? `${provider.id}-last` : undefined}
                  title={blockedAsLast ? "You can’t disconnect your only sign-in method" : undefined}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-accent transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
                >
                  {working ? <Loader2 size={15} className="animate-spin" /> : <Unlink size={15} />}
                  Disconnect
                </button>
              ) : provider.oauth ? (
                <button
                  type="button"
                  onClick={() => handleConnect(provider.id)}
                  disabled={working}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#eef2ff] text-[#4f46e5] hover:bg-[#e0e7ff] transition-colors text-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
                >
                  {working ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
                  Connect
                </button>
              ) : (
                <span className="text-sm text-muted-foreground shrink-0">—</span>
              )}
            </div>
          );
        })}
      </div>

      <AlertDialog open={confirmUnlink !== null} onOpenChange={open => { if (!open) setConfirmUnlink(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {confirmUnlink?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              You’ll no longer be able to sign in with {confirmUnlink?.label}. You can reconnect
              it later. Your quizzes, XP and history are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmUnlink && handleUnlink(confirmUnlink.identity)}
              className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ErrorDialog
        open={actionError !== null}
        onClose={() => setActionError(null)}
        description={actionError ?? ""}
      />
    </>
  );
}
