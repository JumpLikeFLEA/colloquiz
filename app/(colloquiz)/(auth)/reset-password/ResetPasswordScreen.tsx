"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { GraduationCap, Lock, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthLeftPanel, Field } from "../AuthScreen";
import { RECOVERY_EXPIRED_MESSAGE } from "../login/page";

interface ResetPasswordScreenProps {
  // Whether ANY session exists server-side at page load — not recovery-
  // specific (Supabase gives no way to tell a recovery session from an
  // ordinary one). A signed-in user who wanders onto this URL sees the same
  // form a recovery visit does; that's an existing gap (changing a password
  // this way needs no reauthentication), not something this card fixes —
  // see the proposed follow-up card in this issue's closing comment.
  hasSession: boolean;
}

export function ResetPasswordScreen({ hasSession }: ResetPasswordScreenProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(!hasSession);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        // A session that looked live at page load can still be gone by
        // submit time (used elsewhere, expired, cookie cleared) — same
        // expired view either way, not a generic error message.
        if (error.name === "AuthSessionMissingError") {
          setSessionExpired(true);
        } else {
          setError(error.message);
        }
        setLoading(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full">
      {/* Left decorative panel */}
      <AuthLeftPanel />

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center bg-background px-6 py-12 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-sm flex flex-col gap-7"
        >
          {/* Logo (mobile only) */}
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-brand to-brand-accent">
              <GraduationCap size={16} className="text-white" />
            </div>
            <span className="font-semibold text-foreground">Colloquiz</span>
          </div>

          {sessionExpired ? (
            <>
              <div>
                <h1 className="text-foreground">Link expired</h1>
                <p className="text-muted-foreground mt-1.5 text-sm">
                  This password reset link is no longer valid.
                </p>
              </div>

              <p className="text-xs text-destructive-text bg-destructive-subtle border border-destructive-border rounded-lg px-3 py-2">
                {RECOVERY_EXPIRED_MESSAGE}
              </p>

              <Link
                href="/login?error=recovery_expired"
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-brand hover:bg-brand-hover text-white transition-colors cursor-pointer shadow-lg shadow-brand/25"
              >
                <span>Back to sign in</span>
                <ArrowRight size={16} />
              </Link>
            </>
          ) : (
            <>
              <div>
                <h1 className="text-foreground">Set a new password</h1>
                <p className="text-muted-foreground mt-1.5 text-sm">
                  Choose a new password for your account
                </p>
              </div>

              <form onSubmit={handleSubmit} className="contents">
              <div className="flex flex-col gap-4">
                <Field label="New Password" type="password" placeholder="••••••••" icon={<Lock size={16} />}
                  id="password" name="password" required minLength={8} autoComplete="new-password"
                  value={password} onChange={setPassword} />
                <Field label="Confirm Password" type="password" placeholder="••••••••" icon={<Lock size={16} />}
                  id="confirmPassword" name="confirmPassword" required autoComplete="new-password"
                  value={confirmPassword} onChange={setConfirmPassword} />
              </div>

              {error && (
                <p className="text-xs text-destructive-text bg-destructive-subtle border border-destructive-border rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading} className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-brand hover:bg-brand-hover text-white transition-colors cursor-pointer shadow-lg shadow-brand/25 disabled:opacity-60 disabled:cursor-not-allowed">
                <span>{loading ? "Updating…" : "Update password"}</span>
                <ArrowRight size={16} />
              </button>
              </form>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
