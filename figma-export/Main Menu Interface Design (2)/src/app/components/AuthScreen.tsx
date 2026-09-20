import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X, Eye, EyeOff, GraduationCap, Calculator, Atom, Globe,
  BookOpen, Code, Leaf, Landmark, Mail, Lock, User, MapPin,
  Trophy, Star, Flame, Zap, FlaskConical, Brain,
  ChevronRight, ArrowRight, Sparkles, Target, Award,
  TrendingUp, CheckCircle2, Hash
} from "lucide-react";

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
}

function Field({ label, type = "text", placeholder, icon, dark, value, onChange }: FieldProps) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (show ? "text" : "password") : type;

  const baseInput = dark
    ? "bg-white/10 border-white/15 text-white placeholder:text-white/40 focus:border-white/40 focus:bg-white/15"
    : "bg-white border-border text-foreground placeholder:text-muted-foreground focus:border-[#4f46e5]";

  return (
    <div className="flex flex-col gap-1.5">
      <label className={`text-sm font-medium ${dark ? "text-white/80" : "text-foreground"}`}>{label}</label>
      <div className="relative">
        <span className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${dark ? "text-white/40" : "text-muted-foreground"}`}>
          {icon}
        </span>
        <input
          type={inputType}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
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
}

interface VariantProps {
  mode: "login" | "register";
  onToggle: () => void;
  form: AuthFormState;
  setForm: React.Dispatch<React.SetStateAction<AuthFormState>>;
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

function Variant1({ mode, onToggle, form, setForm }: VariantProps) {
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

          {/* Stats row */}
          <div className="flex gap-4 mt-2">
            {[["47", "Subjects"], ["10k+", "Learners"], ["500k+", "Quizzes"]].map(([n, l]) => (
              <div key={l} className="flex flex-col items-center">
                <span className="text-white font-semibold">{n}</span>
                <span className="text-white/50 text-xs">{l}</span>
              </div>
            ))}
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
          <button className="flex items-center justify-center gap-3 w-full py-3 rounded-xl border border-border bg-white hover:bg-accent transition-colors cursor-pointer shadow-sm">
            <GoogleIcon />
            <span className="text-sm font-medium text-foreground">Continue with Google</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

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
                    value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
                </motion.div>
              )}
            </AnimatePresence>
            <Field label="Email" type="email" placeholder="you@example.com" icon={<Mail size={16} />}
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
                    value={form.city} onChange={v => setForm(f => ({ ...f, city: v }))} />
                </motion.div>
              )}
            </AnimatePresence>
            <Field label="Password" type="password" placeholder="••••••••" icon={<Lock size={16} />}
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
                    value={form.confirmPassword} onChange={v => setForm(f => ({ ...f, confirmPassword: v }))} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {mode === "login" && (
            <button className="text-sm text-[#4f46e5] hover:underline self-end -mt-2 cursor-pointer">
              Forgot password?
            </button>
          )}

          <button className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca] text-white transition-colors cursor-pointer shadow-lg shadow-[#4f46e5]/25">
            <span>{mode === "login" ? "Sign In" : "Create Account"}</span>
            <ArrowRight size={16} />
          </button>

          <p className="text-center text-sm text-muted-foreground">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button onClick={onToggle} className="text-[#4f46e5] font-medium hover:underline cursor-pointer">
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>

          {mode === "register" && (
            <p className="text-center text-xs text-muted-foreground">
              By creating an account, you agree to our{" "}
              <span className="text-[#4f46e5] cursor-pointer hover:underline">Terms of Service</span>
              {" "}and{" "}
              <span className="text-[#4f46e5] cursor-pointer hover:underline">Privacy Policy</span>
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
}

// ─── Variant 2 · DARK COSMOS ──────────────────────────────────────────────────
// Deep space dark background, orbiting icons, glassmorphism card center

const ORBIT_ICONS = [
  { icon: Trophy,  color: "#f59e0b", r: 180, speed: 18, offset: 0 },
  { icon: Star,    color: "#6366f1", r: 160, speed: 22, offset: 1.2 },
  { icon: Flame,   color: "#f97316", r: 200, speed: 15, offset: 2.4 },
  { icon: Zap,     color: "#8b5cf6", r: 145, speed: 20, offset: 3.6 },
  { icon: Target,  color: "#10b981", r: 190, speed: 25, offset: 0.8 },
  { icon: Award,   color: "#ec4899", r: 170, speed: 17, offset: 4.2 },
  { icon: Brain,   color: "#06b6d4", r: 155, speed: 23, offset: 5.0 },
  { icon: BookOpen,color: "#a78bfa", r: 210, speed: 14, offset: 1.8 },
];

function Variant2({ mode, onToggle, form, setForm }: VariantProps) {
  return (
    <div className="relative flex items-center justify-center h-full bg-[#07071a] overflow-hidden px-4">
      {/* Stars background */}
      {[...Array(80)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            width: Math.random() * 2 + 1,
            height: Math.random() * 2 + 1,
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
          }}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: Math.random() * 3 + 2, repeat: Infinity, delay: Math.random() * 3 }}
        />
      ))}

      {/* Central glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#4f46e5]/10 blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-[#7c3aed]/15 blur-2xl" />

      {/* Orbiting icons (desktop) */}
      <div className="absolute top-1/2 left-1/2 hidden lg:block">
        {ORBIT_ICONS.map((item, i) => {
          const Icon = item.icon;
          const angleRad = item.offset;
          const x = item.r * Math.cos(angleRad);
          const y = item.r * Math.sin(angleRad);

          return (
            <motion.div
              key={i}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              animate={{
                x: [
                  item.r * Math.cos(item.offset),
                  item.r * Math.cos(item.offset + Math.PI / 2),
                  item.r * Math.cos(item.offset + Math.PI),
                  item.r * Math.cos(item.offset + Math.PI * 1.5),
                  item.r * Math.cos(item.offset + Math.PI * 2),
                ],
                y: [
                  item.r * Math.sin(item.offset),
                  item.r * Math.sin(item.offset + Math.PI / 2),
                  item.r * Math.sin(item.offset + Math.PI),
                  item.r * Math.sin(item.offset + Math.PI * 1.5),
                  item.r * Math.sin(item.offset + Math.PI * 2),
                ],
              }}
              transition={{ duration: item.speed, repeat: Infinity, ease: "linear" }}
            >
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: item.speed, repeat: Infinity, ease: "linear", direction: "reverse" }}
                className="flex items-center justify-center w-10 h-10 rounded-xl"
                style={{ backgroundColor: item.color + "22", border: `1px solid ${item.color}44` }}
              >
                <Icon size={18} style={{ color: item.color }} />
              </motion.div>
            </motion.div>
          );
        })}
      </div>

      {/* Glass card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="bg-white/8 backdrop-blur-xl border border-white/12 rounded-3xl p-8 shadow-2xl">
          {/* Header */}
          <div className="flex flex-col items-center gap-4 mb-8">
            <motion.div
              animate={{ boxShadow: ["0 0 20px #4f46e580", "0 0 40px #7c3aed80", "0 0 20px #4f46e580"] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#4f46e5] to-[#7c3aed]"
            >
              <GraduationCap size={26} className="text-white" />
            </motion.div>
            <div className="text-center">
              <h2 className="text-white">{mode === "login" ? "Welcome back" : "Join Learning Curve"}</h2>
              <p className="text-white/50 text-sm mt-1">{mode === "login" ? "Continue your cosmic journey" : "Start your learning odyssey"}</p>
            </div>
          </div>

          {/* Google */}
          <button className="flex items-center justify-center gap-3 w-full py-3 rounded-xl border border-white/15 bg-white/8 hover:bg-white/15 transition-colors cursor-pointer mb-5">
            <GoogleIcon />
            <span className="text-sm text-white/80 font-medium">Continue with Google</span>
          </button>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-white/30">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <div className="flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {mode === "register" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <Field label="Full Name" placeholder="Alex Johnson" icon={<User size={16} />}
                    dark value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
                </motion.div>
              )}
            </AnimatePresence>
            <Field label="Email" type="email" placeholder="you@example.com" icon={<Mail size={16} />}
              dark value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} />
            <AnimatePresence initial={false}>
              {mode === "register" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <Field label="City" placeholder="New York" icon={<MapPin size={16} />}
                    dark value={form.city} onChange={v => setForm(f => ({ ...f, city: v }))} />
                </motion.div>
              )}
            </AnimatePresence>
            <Field label="Password" type="password" placeholder="••••••••" icon={<Lock size={16} />}
              dark value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} />
            <AnimatePresence initial={false}>
              {mode === "register" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <Field label="Confirm Password" type="password" placeholder="••••••••" icon={<Lock size={16} />}
                    dark value={form.confirmPassword} onChange={v => setForm(f => ({ ...f, confirmPassword: v }))} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl mt-6 cursor-pointer transition-all bg-gradient-to-r from-[#4f46e5] to-[#7c3aed] hover:opacity-90 text-white shadow-lg shadow-[#4f46e5]/30">
            {mode === "login" ? "Sign In" : "Create Account"}
            <ArrowRight size={16} />
          </button>

          <p className="text-center text-sm text-white/40 mt-5">
            {mode === "login" ? "New here? " : "Have an account? "}
            <button onClick={onToggle} className="text-[#a5b4fc] font-medium hover:text-white cursor-pointer transition-colors">
              {mode === "login" ? "Create account" : "Sign in"}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Variant 3 · ACHIEVEMENT FLOW ────────────────────────────────────────────
// Left: white form. Right: animated achievement showcase panel

const ACHIEVEMENT_CARDS = [
  { icon: Trophy,  label: "Quiz Master",     sub: "100% on Physics",      color: "#f59e0b", bg: "#fffbeb", delay: 0 },
  { icon: Flame,   label: "7-Day Streak",    sub: "Keep it up!",          color: "#f97316", bg: "#fff7ed", delay: 0.5 },
  { icon: Star,    label: "Level 12",         sub: "2,450 XP earned",      color: "#6366f1", bg: "#eef2ff", delay: 1.0 },
  { icon: Zap,     label: "+150 XP",          sub: "Advanced Quiz bonus",   color: "#8b5cf6", bg: "#f5f3ff", delay: 1.5 },
  { icon: Award,   label: "Renaissance",      sub: "All subjects unlocked", color: "#10b981", bg: "#ecfdf5", delay: 2.0 },
  { icon: Target,  label: "Accuracy: 94%",   sub: "Last 10 quizzes",       color: "#ec4899", bg: "#fdf2f8", delay: 2.5 },
];

function Variant3({ mode, onToggle, form, setForm }: VariantProps) {
  return (
    <div className="flex h-full">
      {/* Left form */}
      <div className="flex-1 flex items-center justify-center bg-background px-6 py-12 overflow-y-auto">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          className="w-full max-w-sm flex flex-col gap-6"
        >
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-[#4f46e5] to-[#7c3aed]">
              <GraduationCap size={18} className="text-white" />
            </div>
            <span className="font-semibold text-foreground">Learning Curve</span>
          </div>

          <div>
            <h1 className="text-foreground">{mode === "login" ? "Sign in" : "Get started"}</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {mode === "login" ? "Good to see you again." : "Join 10,000+ learners today."}
            </p>
          </div>

          <button className="flex items-center justify-center gap-3 w-full py-3 rounded-xl border border-border bg-white hover:bg-accent transition-colors cursor-pointer shadow-sm">
            <GoogleIcon />
            <span className="text-sm font-medium text-foreground">Continue with Google</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or continue with email</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {mode === "register" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <Field label="Full Name" placeholder="Alex Johnson" icon={<User size={16} />}
                    value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
                </motion.div>
              )}
            </AnimatePresence>
            <Field label="Email" type="email" placeholder="you@example.com" icon={<Mail size={16} />}
              value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} />
            <AnimatePresence initial={false}>
              {mode === "register" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <Field label="City" placeholder="New York" icon={<MapPin size={16} />}
                    value={form.city} onChange={v => setForm(f => ({ ...f, city: v }))} />
                </motion.div>
              )}
            </AnimatePresence>
            <Field label="Password" type="password" placeholder="••••••••" icon={<Lock size={16} />}
              value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} />
            <AnimatePresence initial={false}>
              {mode === "register" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <Field label="Confirm Password" type="password" placeholder="••••••••" icon={<Lock size={16} />}
                    value={form.confirmPassword} onChange={v => setForm(f => ({ ...f, confirmPassword: v }))} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {mode === "login" && (
            <button className="text-sm text-[#4f46e5] hover:underline self-end -mt-1 cursor-pointer">
              Forgot password?
            </button>
          )}

          <button className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca] text-white transition-colors cursor-pointer shadow-lg shadow-[#4f46e5]/20">
            {mode === "login" ? "Sign In" : "Create Free Account"}
            <ChevronRight size={16} />
          </button>

          <p className="text-center text-sm text-muted-foreground">
            {mode === "login" ? "New to Learning Curve? " : "Already have an account? "}
            <button onClick={onToggle} className="text-[#4f46e5] font-medium hover:underline cursor-pointer">
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </motion.div>
      </div>

      {/* Right achievement panel */}
      <div className="hidden lg:flex w-[480px] xl:w-[560px] shrink-0 relative bg-gradient-to-br from-[#4f46e5] via-[#6d28d9] to-[#7c3aed] overflow-hidden flex-col items-center justify-center px-10">
        {/* Background waves */}
        <svg className="absolute bottom-0 left-0 w-full opacity-20" viewBox="0 0 400 200" preserveAspectRatio="none">
          <path d="M0,100 C100,60 300,140 400,100 L400,200 L0,200 Z" fill="white" />
          <path d="M0,140 C120,100 280,160 400,120 L400,200 L0,200 Z" fill="white" opacity="0.5" />
        </svg>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 flex flex-col items-center text-center gap-4 mb-8"
        >
          <span className="text-white/60 text-sm uppercase tracking-widest font-medium">Unlock achievements</span>
          <h2 className="text-white text-2xl leading-tight">Track every<br />milestone you earn</h2>
        </motion.div>

        {/* Achievement cards */}
        <div className="relative z-10 flex flex-col gap-3 w-full max-w-xs">
          {ACHIEVEMENT_CARDS.map((card, i) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: card.delay, duration: 0.4 }}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/15 backdrop-blur border border-white/20 shadow-lg"
              >
                <div
                  className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
                  style={{ backgroundColor: card.color + "30", border: `1px solid ${card.color}50` }}
                >
                  <Icon size={17} style={{ color: card.color }} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-white text-sm font-medium leading-none">{card.label}</p>
                  <p className="text-white/50 text-xs mt-0.5">{card.sub}</p>
                </div>
                <CheckCircle2 size={15} className="text-white/30 shrink-0" />
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Variant 4 · AURORA ───────────────────────────────────────────────────────
// Animated mesh-gradient background with centered form card and floating badges

const FLOAT_BADGES = [
  { icon: Trophy, label: "+100 XP", color: "#f59e0b", top: "15%", left: "8%", delay: 0 },
  { icon: Flame,  label: "Streak!",  color: "#f97316", top: "20%", right: "6%", delay: 0.6 },
  { icon: Star,   label: "A+",       color: "#6366f1", bottom: "22%", left: "10%", delay: 1.2 },
  { icon: Zap,    label: "Fast!",    color: "#8b5cf6", bottom: "18%", right: "8%", delay: 1.8 },
  { icon: Award,  label: "Master",   color: "#10b981", top: "55%", left: "4%", delay: 2.4 },
  { icon: Hash,   label: "#1",       color: "#ec4899", top: "45%", right: "3%", delay: 3.0 },
];

function Variant4({ mode, onToggle, form, setForm }: VariantProps) {
  return (
    <div className="relative flex items-center justify-center h-full overflow-hidden bg-[#f0f0ff] px-4 py-8">
      {/* Animated aurora blobs */}
      <motion.div
        animate={{ scale: [1, 1.15, 1], x: [0, 30, 0], y: [0, -20, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full bg-[#4f46e5]/20 blur-3xl"
      />
      <motion.div
        animate={{ scale: [1, 1.2, 1], x: [0, -40, 0], y: [0, 30, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full bg-[#7c3aed]/20 blur-3xl"
      />
      <motion.div
        animate={{ scale: [1, 1.1, 1], x: [0, 20, 0], y: [0, 40, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute top-1/3 right-1/4 w-80 h-80 rounded-full bg-[#06b6d4]/15 blur-3xl"
      />

      {/* Floating badges (desktop) */}
      {FLOAT_BADGES.map((badge, i) => {
        const Icon = badge.icon;
        const pos: React.CSSProperties = {
          position: "absolute",
          top: badge.top,
          bottom: badge.bottom,
          left: badge.left,
          right: badge.right,
        };
        return (
          <motion.div
            key={badge.label}
            style={pos}
            className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-full bg-white shadow-lg border border-white/80"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: [0, -8, 0] }}
            transition={{
              opacity: { delay: badge.delay, duration: 0.4 },
              y: { delay: badge.delay, duration: 3 + i * 0.4, repeat: Infinity, ease: "easeInOut" },
            }}
          >
            <Icon size={14} style={{ color: badge.color }} />
            <span className="text-xs font-semibold" style={{ color: badge.color }}>{badge.label}</span>
          </motion.div>
        );
      })}

      {/* Central card */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md bg-white rounded-3xl shadow-2xl shadow-[#4f46e5]/10 border border-white/80 overflow-hidden"
      >
        {/* Top gradient strip */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#4f46e5] via-[#7c3aed] to-[#06b6d4]" />

        <div className="p-8 flex flex-col gap-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[#4f46e5] to-[#7c3aed]">
              <GraduationCap size={20} className="text-white" />
            </div>
            <div>
              <p className="font-semibold text-foreground leading-none">Learning Curve</p>
              <p className="text-xs text-muted-foreground mt-0.5">Knowledge Platform</p>
            </div>
          </div>

          {/* Title */}
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col gap-1"
            >
              <h2 className="text-foreground">
                {mode === "login" ? "Welcome back 👋" : "Start learning today ✨"}
              </h2>
              <p className="text-muted-foreground text-sm">
                {mode === "login" ? "Sign in to pick up where you left off" : "Create your free account in seconds"}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Google */}
          <button className="flex items-center justify-center gap-3 w-full py-3.5 rounded-2xl border-2 border-border hover:border-[#4f46e5]/30 bg-white hover:bg-[#eef2ff]/50 transition-all cursor-pointer group">
            <GoogleIcon size={20} />
            <span className="text-sm font-medium text-foreground group-hover:text-[#4f46e5] transition-colors">
              Continue with Google
            </span>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
            <span className="text-xs text-muted-foreground px-2">or</span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          {/* Fields */}
          <div className="flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {mode === "register" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <Field label="Full Name" placeholder="Alex Johnson" icon={<User size={16} />}
                    value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
                </motion.div>
              )}
            </AnimatePresence>
            <Field label="Email address" type="email" placeholder="you@example.com" icon={<Mail size={16} />}
              value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} />
            <AnimatePresence initial={false}>
              {mode === "register" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <Field label="City" placeholder="New York" icon={<MapPin size={16} />}
                    value={form.city} onChange={v => setForm(f => ({ ...f, city: v }))} />
                </motion.div>
              )}
            </AnimatePresence>
            <Field label="Password" type="password" placeholder="••••••••" icon={<Lock size={16} />}
              value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} />
            <AnimatePresence initial={false}>
              {mode === "register" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <Field label="Confirm Password" type="password" placeholder="••••••••" icon={<Lock size={16} />}
                    value={form.confirmPassword} onChange={v => setForm(f => ({ ...f, confirmPassword: v }))} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {mode === "login" && (
            <button className="text-sm text-[#4f46e5] hover:underline self-end -mt-1 cursor-pointer">
              Forgot password?
            </button>
          )}

          {/* Submit */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="relative flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl overflow-hidden cursor-pointer text-white font-medium bg-gradient-to-r from-[#4f46e5] to-[#7c3aed] shadow-lg shadow-[#4f46e5]/25 hover:shadow-xl hover:shadow-[#4f46e5]/30 transition-shadow"
          >
            <Sparkles size={16} />
            {mode === "login" ? "Sign In" : "Create My Account"}
            <ArrowRight size={16} />
          </motion.button>

          <p className="text-center text-sm text-muted-foreground">
            {mode === "login" ? "New to Learning Curve? " : "Already a member? "}
            <button onClick={onToggle} className="text-[#4f46e5] font-medium hover:underline cursor-pointer">
              {mode === "login" ? "Sign up free" : "Sign in"}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Variant selector tabs ────────────────────────────────────────────────────

const VARIANTS = [
  { id: 1, label: "Academia",    sub: "Split" },
  { id: 2, label: "Cosmos",      sub: "Dark" },
  { id: 3, label: "Achievement", sub: "Flow" },
  { id: 4, label: "Aurora",      sub: "Gradient" },
] as const;

// ─── Main AuthScreen ──────────────────────────────────────────────────────────

interface AuthScreenProps {
  onClose: () => void;
}

export function AuthScreen({ onClose }: AuthScreenProps) {
  const [variant, setVariant] = useState<1 | 2 | 3 | 4>(1);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ email: "", password: "", name: "", confirmPassword: "", city: "" });

  const handleToggle = () => {
    setMode(m => m === "login" ? "register" : "login");
    setForm({ email: "", password: "", name: "", confirmPassword: "", city: "" });
  };

  const isDark = variant === 2;

  const variantProps: VariantProps = { mode, onToggle: handleToggle, form, setForm };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
    >
      {/* Variant selector — floating pill */}
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 p-1 rounded-2xl shadow-xl"
        style={{
          background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
          backdropFilter: "blur(12px)",
          border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.08)",
        }}
      >
        {VARIANTS.map(v => (
          <button
            key={v.id}
            onClick={() => setVariant(v.id)}
            className={`relative px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
              variant === v.id
                ? "text-white"
                : isDark ? "text-white/40 hover:text-white/70" : "text-foreground/50 hover:text-foreground"
            }`}
          >
            {variant === v.id && (
              <motion.div
                layoutId="variantPill"
                className="absolute inset-0 rounded-xl bg-[#4f46e5]"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative">{v.label}</span>
            <span className={`relative text-[10px] leading-none ${variant === v.id ? "text-white/60" : "opacity-50"}`}>{v.sub}</span>
          </button>
        ))}
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className={`absolute top-4 right-4 z-20 flex items-center justify-center w-9 h-9 rounded-xl transition-colors cursor-pointer ${
          isDark
            ? "bg-white/10 hover:bg-white/20 text-white/70"
            : "bg-black/8 hover:bg-black/12 text-foreground/60"
        }`}
      >
        <X size={18} />
      </button>

      {/* Variant content */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={variant}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.22 }}
            className="h-full"
          >
            {variant === 1 && <Variant1 {...variantProps} />}
            {variant === 2 && <Variant2 {...variantProps} />}
            {variant === 3 && <Variant3 {...variantProps} />}
            {variant === 4 && <Variant4 {...variantProps} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
