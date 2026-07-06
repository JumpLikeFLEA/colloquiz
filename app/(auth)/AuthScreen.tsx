"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye, EyeOff, GraduationCap, Calculator, Atom, Globe,
  Code, Leaf, Landmark, Mail, Lock, User, MapPin,
  FlaskConical, Brain, ArrowRight
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ─── Shared primitives ────────────────────────────────────────────────────────

function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

interface FieldProps {
  label: string;
  type?: string;
  placeholder: string;
  icon: React.ReactNode;
  dark?: boolean;
  value: string;
  onChange: (v: string) => void;
  id?: string;
  name?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
}

function Field({ label, type = "text", placeholder, icon, dark, value, onChange, id, name, required, minLength, autoComplete }: FieldProps) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (show ? "text" : "password") : type;

  const baseInput = dark
    ? "bg-white/10 border-white/15 text-white placeholder:text-white/40 focus:border-white/40 focus:bg-white/15"
    : "bg-white border-border text-foreground placeholder:text-muted-foreground focus:border-[#4f46e5]";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={`text-sm font-medium ${dark ? "text-white/80" : "text-foreground"}`}>{label}</label>
      <div className="relative">
        <span className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${dark ? "text-white/40" : "text-muted-foreground"}`}>
          {icon}
        </span>
        <input
          type={inputType}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          id={id}
          name={name}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          className={`w-full pl-10 ${isPassword ? "pr-10" : "pr-4"} py-3 rounded-xl border transition-all outline-none focus:ring-2 ${dark ? "focus:ring-white/20" : "focus:ring-[#4f46e5]/20"} ${baseInput}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(v => !v)}
            className={`absolute right-3.5 top-1/2 -translate-y-1/2 cursor-pointer ${dark ? "text-white/40 hover:text-white/70" : "text-muted-foreground hover:text-foreground"} transition-colors`}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

interface AuthFormState {
  email: string; password: string; name: string;
  confirmPassword: string; city: string;
}

// ─── Variant 1 · ACADEMIA SPLIT ───────────────────────────────────────────────
// Indigo gradient left panel with floating subject cards; clean white form right

const FLOAT_SUBJECTS = [
  { icon: Calculator, label: "Mathematics", top: "10%", left: "6%", delay: 0 },
  { icon: Atom,       label: "Physics",     top: "18%", right: "4%", delay: 0.4 },
  { icon: Globe,      label: "Geography",   top: "42%", left: "2%", delay: 0.8 },
  { icon: Code,       label: "CS",          top: "50%", right: "6%", delay: 1.2 },
  { icon: Leaf,       label: "Biology",     bottom: "22%", left: "8%", delay: 1.6 },
  { icon: FlaskConical, label: "Chemistry", bottom: "18%", right: "3%", delay: 2.0 },
  { icon: Landmark,   label: "History",     bottom: "6%", left: "30%", delay: 2.4 },
  { icon: Brain,      label: "Psychology",  top: "6%", left: "40%", delay: 2.8 },
];

interface AuthScreenProps {
  initialMode: "login" | "register";
}

export function AuthScreen({ initialMode }: AuthScreenProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [form, setForm] = useState<AuthFormState>({ email: "", password: "", name: "", confirmPassword: "", city: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleToggle = () => {
    const next = mode === "login" ? "register" : "login";
    setMode(next);
    setForm({ email: "", password: "", name: "", confirmPassword: "", city: "" });
    setError(null);
    window.history.replaceState(null, "", next === "login" ? "/login" : "/signup");
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "register" && form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { error } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({
            email: form.email,
            password: form.password,
          })
        : await supabase.auth.signUp({
            email: form.email,
            password: form.password,
            options: {
              data: { full_name: form.name, city: form.city },
            },
          });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleGoogleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <div className="flex h-full">
      {/* Left decorative panel */}
      <div className="hidden lg:flex w-[460px] xl:w-[520px] shrink-0 relative overflow-hidden flex-col items-center justify-center bg-gradient-to-br from-[#3730a3] via-[#4f46e5] to-[#7c3aed]">
        {/* Dot grid */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="dots1" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.5" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots1)" />
        </svg>

        {/* Glow orb */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-white/10 rounded-full blur-3xl" />

        {/* Floating subject cards */}
        {FLOAT_SUBJECTS.map((s, i) => {
          const Icon = s.icon;
          const pos: React.CSSProperties = {
            position: "absolute",
            top: s.top,
            bottom: s.bottom,
            left: s.left,
            right: s.right,
          };
          return (
            <motion.div
              key={s.label}
              style={pos}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1, y: [0, -10, 0] }}
              transition={{
                opacity: { delay: s.delay, duration: 0.4 },
                scale:   { delay: s.delay, duration: 0.4 },
                y:       { delay: s.delay, duration: 3 + i * 0.3, repeat: Infinity, ease: "easeInOut" },
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 shadow-lg"
            >
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/20">
                <Icon size={14} className="text-white" />
              </div>
              <span className="text-white/90 text-xs font-medium">{s.label}</span>
            </motion.div>
          );
        })}

        {/* Center content */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 flex flex-col items-center text-center gap-6 px-12"
        >
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 backdrop-blur border border-white/30 shadow-xl">
            <GraduationCap size={32} className="text-white" />
          </div>
          <div>
            <h2 className="text-3xl text-white leading-tight">Your learning<br />journey starts here</h2>
            <p className="text-white/60 mt-3 text-sm leading-relaxed">Join thousands of learners mastering<br />subjects through intelligent quizzes.</p>
          </div>

        </motion.div>

        {/* Bottom rating */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="absolute bottom-8 left-0 right-0 flex justify-center"
        >

        </motion.div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center bg-background px-6 py-12 overflow-y-auto">
        <motion.div
          key={mode}
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
            <span className="font-semibold text-foreground">Learning Curve</span>
          </div>

          <div>
            <h1 className="text-foreground">{mode === "login" ? "Welcome back" : "Create account"}</h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              {mode === "login"
                ? "Sign in to continue your learning journey"
                : "Start mastering new subjects today"}
            </p>
          </div>

          {/* Google */}
          <button type="button" onClick={handleGoogleLogin} className="flex items-center justify-center gap-3 w-full py-3 rounded-xl border border-border bg-white hover:bg-accent transition-colors cursor-pointer shadow-sm">
            <GoogleIcon />
            <span className="text-sm font-medium text-foreground">Continue with Google</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="contents">
          <div className="flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {mode === "register" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <Field label="Full Name" placeholder="Alex Johnson" icon={<User size={16} />}
                    id="name" name="name" required autoComplete="name"
                    value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
                </motion.div>
              )}
            </AnimatePresence>
            <Field label="Email" type="email" placeholder="you@example.com" icon={<Mail size={16} />}
              id="email" name="email" required autoComplete="email"
              value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} />
            <AnimatePresence initial={false}>
              {mode === "register" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <Field label="City" placeholder="New York" icon={<MapPin size={16} />}
                    id="city" name="city" required autoComplete="address-level2"
                    value={form.city} onChange={v => setForm(f => ({ ...f, city: v }))} />
                </motion.div>
              )}
            </AnimatePresence>
            <Field label="Password" type="password" placeholder="••••••••" icon={<Lock size={16} />}
              id="password" name="password" required
              minLength={mode === "register" ? 8 : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} />
            <AnimatePresence initial={false}>
              {mode === "register" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <Field label="Confirm Password" type="password" placeholder="••••••••" icon={<Lock size={16} />}
                    id="confirmPassword" name="confirmPassword" required autoComplete="new-password"
                    value={form.confirmPassword} onChange={v => setForm(f => ({ ...f, confirmPassword: v }))} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {mode === "login" && (
            <button type="button" className="text-sm text-[#4f46e5] hover:underline self-end -mt-2 cursor-pointer">
              Forgot password?
            </button>
          )}

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca] text-white transition-colors cursor-pointer shadow-lg shadow-[#4f46e5]/25 disabled:opacity-60 disabled:cursor-not-allowed">
            <span>
              {loading
                ? (mode === "login" ? "Signing in…" : "Creating account…")
                : (mode === "login" ? "Sign In" : "Create Account")}
            </span>
            <ArrowRight size={16} />
          </button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button type="button" onClick={handleToggle} className="text-[#4f46e5] font-medium hover:underline cursor-pointer">
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>

        </motion.div>
      </div>
    </div>
  );
}
