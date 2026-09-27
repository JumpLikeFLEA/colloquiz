"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Lock } from "lucide-react";
import { alliengllCopy } from "@/lib/alliengll/copy";
import { isInAppBrowser } from "@/lib/inAppBrowser";
import { createAttemptStore, toRecordAttemptPayload } from "@/lib/lessonPlayer/attemptStore";
import { getCurrentFunnelSource } from "@/lib/funnelSource";
import { GoogleIcon, DiscordIcon } from "@/app/components/ProviderIcons";

/**
 * ANON-004 — the registration offer PLAY-007's `RegistrationOfferSlot`
 * reserved. Mounted by `LessonCompletion` only after a completed lesson
 * (`lessonScore.status === "scored"`) and only for an anonymous learner —
 * see docs/decisions/0068 for why those are the gating signals and why this
 * is its own component rather than a reuse of `AuthScreen`.
 *
 * `@supabase/ssr` is imported dynamically inside `handleSubmit`/
 * `handleOAuth`, not at module scope, so an anonymous visitor who never
 * opens this form never downloads that chunk — same reasoning as
 * `LessonPlayer`'s own `recordSignedInAttempt`.
 */
export function RegistrationOffer({ lessonPath }: { lessonPath: string }) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState<"email" | "google" | "discord" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  if (dismissed) return null;

  const inAppBrowser = isInAppBrowser(typeof navigator === "undefined" ? null : navigator.userAgent);

  /** Stashes any local attempts server-side (ANON-006) and returns the raw
   * claim token to embed in the confirmation redirect, or null when there is
   * nothing to migrate — a learner opening the offer without having attempted
   * anything yet needs no pending_claims row at all. */
  async function stashLocalAttempts(): Promise<string | null> {
    const store = createAttemptStore();
    const attempts = store.getAll();
    if (attempts.length === 0) return null;

    const response = await fetch("/api/pending-claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attempts: toRecordAttemptPayload(attempts) }),
    });
    if (!response.ok) {
      // Best-effort: a failed stash means the cross-browser migration is
      // lost, but registration itself must not be blocked by it — the
      // default path (LessonPlayer's mount-time flush) still recovers the
      // attempts if this same browser ever gets a session.
      return null;
    }
    const { token } = (await response.json()) as { token: string };
    return token;
  }

  function buildEmailRedirectTo(claimToken: string | null): string {
    const params = new URLSearchParams({ next: lessonPath });
    if (claimToken) params.set("claim", claimToken);
    // OPS-008 — the classified source travels through the redirect the same
    // way `claim` does: /auth/confirm fires the signup funnel event
    // server-side (docs/decisions/0069) and has no sessionStorage of its own
    // to read it from otherwise.
    const source = getCurrentFunnelSource();
    if (source) params.set("source", source);
    return `${window.location.origin}/auth/confirm?${params.toString()}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!agreed) {
      setError(alliengllCopy.signupOffer.consentRequired);
      return;
    }
    setLoading("email");
    try {
      const claimToken = await stashLocalAttempts();
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: buildEmailRedirectTo(claimToken) },
      });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(null);
        return;
      }
      setEmailSent(true);
      setLoading(null);
    } catch {
      setError(alliengllCopy.signupOffer.genericError);
      setLoading(null);
    }
  }

  async function handleOAuth(provider: "google" | "discord") {
    setError(null);
    setLoading(provider);
    try {
      // OAuth completes in this same browser (no email round trip), so
      // nothing here needs pending_claims — LessonPlayer's mount-time flush
      // (docs/decisions/0068 Decision 6) picks up the local attempts once
      // this page reloads signed in.
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const callbackParams = new URLSearchParams({ next: lessonPath });
      const oauthSource = getCurrentFunnelSource();
      if (oauthSource) callbackParams.set("source", oauthSource);
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback?${callbackParams.toString()}` },
      });
      if (oauthError) {
        setError(oauthError.message);
        setLoading(null);
      }
      // On success the browser navigates away; nothing further to do here.
    } catch {
      setError(alliengllCopy.signupOffer.genericError);
      setLoading(null);
    }
  }

  if (!expanded) {
    return (
      <div className="rounded-xl border border-brand-border bg-brand-subtle p-4 flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-brand-text">{alliengllCopy.signupOffer.title}</h3>
        <p className="text-sm text-brand-text">{alliengllCopy.signupOffer.body}</p>
        <div className="flex items-center gap-3 mt-1">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="px-4 py-2 rounded-xl bg-brand text-white hover:bg-brand-hover transition-colors text-sm font-medium cursor-pointer"
          >
            {alliengllCopy.signupOffer.cta}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {alliengllCopy.signupOffer.dismiss}
          </button>
        </div>
      </div>
    );
  }

  if (emailSent) {
    return (
      <div className="rounded-xl border border-brand-border bg-brand-subtle p-4 flex flex-col gap-1.5">
        <h3 className="text-sm font-semibold text-brand-text">{alliengllCopy.signupOffer.checkEmailTitle}</h3>
        <p className="text-sm text-brand-text">{alliengllCopy.signupOffer.checkEmailBody}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-brand-border bg-brand-subtle p-4 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-brand-text">{alliengllCopy.signupOffer.title}</h3>

      {inAppBrowser ? (
        <p className="text-xs text-brand-text">{alliengllCopy.signupOffer.inAppBrowserNotice}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleOAuth("google")}
              disabled={loading !== null}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-border bg-card hover:bg-accent transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <GoogleIcon size={16} />
              <span className="text-sm font-medium text-foreground">{alliengllCopy.signupOffer.oauthGoogle}</span>
            </button>
            <button
              type="button"
              onClick={() => handleOAuth("discord")}
              disabled={loading !== null}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-border bg-card hover:bg-accent transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <DiscordIcon size={16} />
              <span className="text-sm font-medium text-foreground">{alliengllCopy.signupOffer.oauthDiscord}</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">{alliengllCopy.signupOffer.orDivider}</span>
            <div className="flex-1 h-px bg-border" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="registration-offer-email" className="text-sm font-medium text-foreground">
            {alliengllCopy.signupOffer.emailLabel}
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Mail size={16} />
            </span>
            <input
              type="email"
              id="registration-offer-email"
              name="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:border-brand outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="registration-offer-password" className="text-sm font-medium text-foreground">
            {alliengllCopy.signupOffer.passwordLabel}
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Lock size={16} />
            </span>
            <input
              type="password"
              id="registration-offer-password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:border-brand outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
        </div>

        <label className="flex items-start gap-2.5 text-xs text-brand-text cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            required
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand cursor-pointer"
          />
          <span>
            {alliengllCopy.signupOffer.consentPrefix}{" "}
            <Link href="/terms" target="_blank" rel="noreferrer" className="font-medium hover:underline">
              {alliengllCopy.signupOffer.termsLink}
            </Link>{" "}
            {alliengllCopy.signupOffer.consentJoiner}{" "}
            <Link href="/privacy" target="_blank" rel="noreferrer" className="font-medium hover:underline">
              {alliengllCopy.signupOffer.privacyLink}
            </Link>
            .
          </span>
        </label>

        {error && (
          <p className="text-xs text-destructive-text bg-destructive-subtle border border-destructive-border rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading !== null}
            className="px-4 py-2.5 rounded-xl bg-brand text-white hover:bg-brand-hover transition-colors text-sm font-medium cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading === "email" ? alliengllCopy.signupOffer.submitting : alliengllCopy.signupOffer.submit}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {alliengllCopy.signupOffer.dismiss}
          </button>
        </div>
      </form>
    </div>
  );
}
