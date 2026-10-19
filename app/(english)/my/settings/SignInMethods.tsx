"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserIdentity } from "@supabase/supabase-js";
import { Check, KeyRound, Link2, Loader2, Unlink } from "lucide-react";
import { DiscordIcon, GoogleIcon, TelegramIcon } from "@/app/components/ProviderIcons";
import type { OAuthProvider } from "@/lib/authRedirect";
import { identityLabel, isOnlySignInMethod } from "@/lib/signInMethods";
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
import type { SignInLabels } from "./settingsCopy";

// Colloquiz's ProvidersSection order, so the two lists read the same.
const PROVIDERS = [
  { id: "email", label: null, icon: <KeyRound size={18} className="text-muted-foreground" />, oauth: false },
  { id: "google", label: "Google", icon: <GoogleIcon size={18} />, oauth: true },
  { id: "discord", label: "Discord", icon: <DiscordIcon size={18} />, oauth: true },
  { id: "custom:telegram", label: "Telegram", icon: <TelegramIcon size={18} />, oauth: true },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

// The secondary and primary buttons of the English cards (the calendar feed
// panel's), at the 44px target.
const SECONDARY_BUTTON =
  "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY_BUTTON =
  "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-brand-subtle px-3 py-2 text-sm font-medium text-brand-text transition-colors hover:bg-brand-subtle-hover disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The learner's sign-in methods on `/my/settings` (docs/decisions/0181),
 * Colloquiz's ProvidersSection with the English surface's copy and rules:
 *
 * - The identities are read server-side (page.tsx), so the list is right on
 *   first paint; the last-method rule is lib/signInMethods.ts's.
 * - Connect is offered only where `available` says the provider works: in an
 *   Instagram or Telegram in-app browser none does yet (lib/inAppBrowser.ts,
 *   the registration offer's rule, 0098), so the row says to open the page
 *   in a regular browser instead. Disconnect works anywhere.
 * - Linking returns to this page through /auth/callback.
 * - No Toaster on this surface: the outcome is a polite status line under
 *   the list, and an error is a destructive-subtle line, both inline.
 */
export function SignInMethods({
  identities,
  loadError,
  available,
  labels,
}: {
  identities: UserIdentity[];
  loadError: string | null;
  /** Per OAuth provider, whether to offer Connect in this browser. */
  available: Record<OAuthProvider, boolean>;
  labels: SignInLabels;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<{ identity: UserIdentity; label: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isLastMethod = isOnlySignInMethod(identities.length);
  const anyHidden = PROVIDERS.some((p) => p.oauth && !available[p.id as OAuthProvider] && !identities.some((i) => i.provider === p.id));

  async function handleConnect(provider: OAuthProvider) {
    setStatus(null);
    setActionError(null);
    setBusy(provider);
    // Loaded on the click, not with the page: no @supabase/ssr on an English
    // route's first load (eslint.config.mjs, OPS-013), the LessonPlayer /
    // VoiceRecorder precedent.
    const { createClient } = await import("@/lib/supabase/client");
    const { error } = await createClient().auth.linkIdentity({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/my/settings` },
    });
    // On success the browser navigates to the provider; only failures land here.
    if (error) {
      setBusy(null);
      setActionError(labels.actionError.replace("{error}", error.message));
    }
  }

  async function handleUnlink(identity: UserIdentity, label: string) {
    setConfirmUnlink(null);
    setStatus(null);
    setActionError(null);
    setBusy(identity.provider as ProviderId);
    const { createClient } = await import("@/lib/supabase/client");
    const { error } = await createClient().auth.unlinkIdentity(identity);
    setBusy(null);
    if (error) {
      setActionError(labels.actionError.replace("{error}", error.message));
      return;
    }
    setStatus(labels.disconnected.replace("{provider}", label));
    // The list came from the server; re-render it there rather than keeping a
    // second copy in client state that could drift.
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="divide-y divide-border rounded-2xl border border-border bg-card">
        {loadError && (
          <p className="px-4 py-4 text-sm text-destructive-text sm:px-5">{labels.loadError.replace("{error}", loadError)}</p>
        )}

        {PROVIDERS.map((provider) => {
          const label = provider.label ?? labels.emailPassword;
          const identity = identities.find((i) => i.provider === provider.id);
          const connected = !!identity;
          const working = busy === provider.id;
          // Only a connected method can be the last one, so the rule only ever
          // disables a Disconnect, never a Connect.
          const blockedAsLast = connected && isLastMethod;
          const detail = identity ? identityLabel(identity.identity_data) : null;
          const canConnect = provider.oauth && available[provider.id as OAuthProvider];

          return (
            <div key={provider.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:p-5" data-provider={provider.id}>
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">{provider.icon}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {connected ? (
                      <span className="inline-flex items-center gap-1 text-success">
                        <Check size={12} aria-hidden="true" />
                        {labels.connected}
                        {detail && <> · {detail}</>}
                      </span>
                    ) : (
                      labels.notConnected
                    )}
                  </p>
                  {blockedAsLast && <p className="mt-1 text-xs text-muted-foreground">{labels.onlyMethod}</p>}
                  {!connected && !provider.oauth && (
                    <p className="mt-1 text-xs text-muted-foreground">{labels.emailAddedBySignup}</p>
                  )}
                </div>
              </div>

              {connected ? (
                <button
                  type="button"
                  onClick={() => setConfirmUnlink({ identity, label })}
                  disabled={blockedAsLast || working}
                  title={blockedAsLast ? labels.onlyMethodTitle : undefined}
                  className={SECONDARY_BUTTON}
                >
                  {working ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Unlink size={15} aria-hidden="true" />}
                  {labels.disconnect}
                </button>
              ) : canConnect ? (
                <button
                  type="button"
                  onClick={() => void handleConnect(provider.id as OAuthProvider)}
                  disabled={working}
                  className={PRIMARY_BUTTON}
                >
                  {working ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />}
                  {labels.connect}
                </button>
              ) : (
                <span className="shrink-0 text-sm text-muted-foreground" aria-hidden="true">
                  —
                </span>
              )}
            </div>
          );
        })}
      </div>

      {anyHidden && <p className="text-xs text-muted-foreground" data-sign-in="in-app-note">{labels.inAppNote}</p>}
      <p className="text-sm text-muted-foreground" role="status">
        {status}
      </p>
      {actionError && (
        <p className="rounded-xl border border-destructive-border bg-destructive-subtle px-3 py-2 text-sm text-destructive-text" role="alert">
          {actionError}
        </p>
      )}

      <AlertDialog open={confirmUnlink !== null} onOpenChange={(open) => { if (!open) setConfirmUnlink(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.confirmTitle.replace("{provider}", confirmUnlink?.label ?? "")}</AlertDialogTitle>
            <AlertDialogDescription>{labels.confirmBody.replace("{provider}", confirmUnlink?.label ?? "")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer rounded-xl">{labels.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmUnlink && void handleUnlink(confirmUnlink.identity, confirmUnlink.label)}
              className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
            >
              {labels.disconnect}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
