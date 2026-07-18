"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { GraduationCap, Lock, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthLeftPanel, Field } from "../AuthScreen";

export function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        setError(error.message);
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
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#4f46e5] to-[#7c3aed]">
              <GraduationCap size={16} className="text-white" />
            </div>
            <span className="font-semibold text-foreground">Noosphere</span>
          </div>

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
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca] text-white transition-colors cursor-pointer shadow-lg shadow-[#4f46e5]/25 disabled:opacity-60 disabled:cursor-not-allowed">
            <span>{loading ? "Updating…" : "Update password"}</span>
            <ArrowRight size={16} />
          </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
