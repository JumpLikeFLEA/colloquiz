"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PAPER_PANEL_CLASS } from "@/app/(english)/surfaceClasses";
import { Field } from "../AuthScreen";
import { PAPER_AUTH_CARD_CLASS, PAPER_PRIMARY_BUTTON_CLASS, PaperAuthFrame, PaperHeading } from "../PaperAuthFrame";
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
    <PaperAuthFrame>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.25 }}
        className={`${PAPER_PANEL_CLASS} ${PAPER_AUTH_CARD_CLASS}`}
      >
        {sessionExpired ? (
          <>
            <div>
              <PaperHeading text="Link expired" />
              <p className="text-muted-foreground mt-1.5 text-sm">
                This password reset link is no longer valid.
              </p>
            </div>

            <p className="text-xs text-destructive-text bg-destructive-subtle border border-destructive-border rounded-lg px-3 py-2">
              {RECOVERY_EXPIRED_MESSAGE}
            </p>

            {/* `next=/` keeps the sign-in screen in the paper look (VIS-006):
                it is where a sign-in without `next` already lands. */}
            <Link href="/login?error=recovery_expired&next=/" className={PAPER_PRIMARY_BUTTON_CLASS}>
              <span>Back to sign in</span>
              <ArrowRight size={16} />
            </Link>
          </>
        ) : (
          <>
            <div>
              <PaperHeading text="Set a new password" />
              <p className="text-muted-foreground mt-1.5 text-sm">
                Choose a new password for your account
              </p>
            </div>

            <form onSubmit={handleSubmit} className="contents">
            <div className="flex flex-col gap-4">
              <Field paper label="New Password" type="password" placeholder="••••••••" icon={<Lock size={16} />}
                id="password" name="password" required minLength={8} autoComplete="new-password"
                value={password} onChange={setPassword} />
              <Field paper label="Confirm Password" type="password" placeholder="••••••••" icon={<Lock size={16} />}
                id="confirmPassword" name="confirmPassword" required autoComplete="new-password"
                value={confirmPassword} onChange={setConfirmPassword} />
            </div>

            {error && (
              <p className="text-xs text-destructive-text bg-destructive-subtle border border-destructive-border rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className={PAPER_PRIMARY_BUTTON_CLASS}>
              <span>{loading ? "Updating…" : "Update password"}</span>
              <ArrowRight size={16} />
            </button>
            </form>
          </>
        )}
      </motion.div>
    </PaperAuthFrame>
  );
}
