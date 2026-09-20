import { useState } from "react";
import { motion } from "motion/react";
import {
  Trophy, Star, Flame, Zap, Target, BookOpen, Brain, Shield,
  Medal, Crown, Rocket, Award, TrendingUp, Clock, Hash, Globe,
  Lock, CheckCircle2
} from "lucide-react";

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: typeof Trophy;
  color: string;
  bg: string;
  xp: number;
  category: string;
  unlocked: boolean;
  progress?: number;
  progressMax?: number;
  unlockedDate?: string;
  rarity: "common" | "rare" | "epic" | "legendary";
}

const ACHIEVEMENTS: Achievement[] = [
  { id: "first_quiz", title: "First Steps", description: "Complete your first quiz", icon: Rocket, color: "#6366f1", bg: "#eef2ff", xp: 50, category: "Milestones", unlocked: true, unlockedDate: "Jan 15, 2026", rarity: "common" },
  { id: "perfect_10", title: "Perfect Score", description: "Get 100% on any quiz", icon: Star, color: "#f59e0b", bg: "#fffbeb", xp: 100, category: "Performance", unlocked: true, unlockedDate: "Feb 2, 2026", rarity: "rare" },
  { id: "streak_7", title: "Week Warrior", description: "Maintain a 7-day streak", icon: Flame, color: "#f97316", bg: "#fff7ed", xp: 200, category: "Streaks", unlocked: true, unlockedDate: "Jun 1, 2026", rarity: "rare" },
  { id: "history_master", title: "History Buff", description: "Complete 10 History quizzes", icon: Globe, color: "#f59e0b", bg: "#fffbeb", xp: 150, category: "Subjects", unlocked: true, unlockedDate: "Apr 10, 2026", rarity: "common" },
  { id: "speed_demon", title: "Speed Demon", description: "Finish a quiz in under 5 minutes", icon: Zap, color: "#ec4899", bg: "#fdf2f8", xp: 100, category: "Performance", unlocked: true, unlockedDate: "Mar 5, 2026", rarity: "common" },
  { id: "quizzes_25", title: "Dedicated Learner", description: "Complete 25 quizzes", icon: BookOpen, color: "#10b981", bg: "#ecfdf5", xp: 250, category: "Milestones", unlocked: true, unlockedDate: "May 20, 2026", rarity: "rare" },
  { id: "streak_30", title: "Monthly Master", description: "Maintain a 30-day streak", icon: Crown, color: "#f59e0b", bg: "#fffbeb", xp: 500, category: "Streaks", unlocked: false, progress: 7, progressMax: 30, rarity: "epic" },
  { id: "all_subjects", title: "Renaissance", description: "Complete a quiz in every subject", icon: Brain, color: "#8b5cf6", bg: "#f5f3ff", xp: 400, category: "Milestones", unlocked: false, progress: 9, progressMax: 14, rarity: "epic" },
  { id: "perfect_5", title: "Flawless Run", description: "Get 5 perfect scores in a row", icon: Shield, color: "#6366f1", bg: "#eef2ff", xp: 300, category: "Performance", unlocked: false, progress: 2, progressMax: 5, rarity: "epic" },
  { id: "hard_10", title: "Iron Will", description: "Complete 10 Hard quizzes", icon: Medal, color: "#ef4444", bg: "#fef2f2", xp: 350, category: "Performance", unlocked: false, progress: 4, progressMax: 10, rarity: "rare" },
  { id: "quizzes_100", title: "Century Club", description: "Complete 100 quizzes", icon: Trophy, color: "#f59e0b", bg: "#fffbeb", xp: 1000, category: "Milestones", unlocked: false, progress: 47, progressMax: 100, rarity: "legendary" },
  { id: "streak_100", title: "Centurion", description: "Maintain a 100-day streak", icon: Flame, color: "#dc2626", bg: "#fef2f2", xp: 2000, category: "Streaks", unlocked: false, progress: 7, progressMax: 100, rarity: "legendary" },
  { id: "speed_5", title: "Lightning Fast", description: "Finish 5 quizzes under 5 minutes", icon: Zap, color: "#06b6d4", bg: "#ecfeff", xp: 200, category: "Performance", unlocked: false, progress: 3, progressMax: 5, rarity: "rare" },
  { id: "advanced_5", title: "Deep Diver", description: "Complete 5 Advanced quizzes", icon: Target, color: "#7c3aed", bg: "#f5f3ff", xp: 300, category: "Milestones", unlocked: false, progress: 2, progressMax: 5, rarity: "rare" },
  { id: "custom_quiz", title: "Quiz Maker", description: "Create your first custom quiz", icon: Award, color: "#14b8a6", bg: "#f0fdfa", xp: 150, category: "Milestones", unlocked: false, progress: 0, progressMax: 1, rarity: "common" },
];

const CATEGORIES = ["All", "Milestones", "Performance", "Streaks", "Subjects"];

const RARITY_CONFIG = {
  common: { label: "Common", color: "#6b7280", border: "border-gray-200" },
  rare: { label: "Rare", color: "#3b82f6", border: "border-blue-200" },
  epic: { label: "Epic", color: "#8b5cf6", border: "border-purple-200" },
  legendary: { label: "Legendary", color: "#f59e0b", border: "border-amber-300" },
};

const STATS = [
  { label: "Achievements Unlocked", value: "6 / 15", icon: Trophy, color: "#4f46e5" },
  { label: "Total XP Earned", value: "2,450", icon: Star, color: "#f59e0b" },
  { label: "Current Streak", value: "7 days", icon: Flame, color: "#f97316" },
  { label: "Quizzes Completed", value: "47", icon: Hash, color: "#10b981" },
  { label: "Avg. Score", value: "81%", icon: TrendingUp, color: "#8b5cf6" },
  { label: "Total Time", value: "14.2h", icon: Clock, color: "#ec4899" },
];

export function Achievements() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [showUnlocked, setShowUnlocked] = useState<"all" | "unlocked" | "locked">("all");

  const filtered = ACHIEVEMENTS.filter(a => {
    const catMatch = activeCategory === "All" || a.category === activeCategory;
    const lockMatch = showUnlocked === "all" || (showUnlocked === "unlocked" ? a.unlocked : !a.unlocked);
    return catMatch && lockMatch;
  });

  const unlocked = ACHIEVEMENTS.filter(a => a.unlocked).length;
  const totalXP = ACHIEVEMENTS.filter(a => a.unlocked).reduce((s, a) => s + a.xp, 0);

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-foreground">Achievements</h1>
        <p className="text-muted-foreground mt-1">Track your progress and unlock rewards as you learn</p>
      </div>

      {/* Level & XP Banner */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl p-6 bg-gradient-to-r from-[#4f46e5] to-[#7c3aed] text-white"
      >
        <div className="absolute inset-0 opacity-10">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full border border-white"
              style={{
                width: `${(i + 1) * 80}px`,
                height: `${(i + 1) * 80}px`,
                right: `-${i * 20}px`,
                top: `${-40 + i * 10}px`,
              }}
            />
          ))}
        </div>
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 backdrop-blur">
              <Crown size={30} className="text-amber-300" />
            </div>
            <div>
              <p className="text-white/70 text-sm">Current Level</p>
              <p className="text-4xl font-bold">12</p>
              <p className="text-white/70 text-sm">Advanced Learner</p>
            </div>
          </div>
          <div className="flex-1 max-w-xs">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-white/80">Progress to Level 13</span>
              <span className="text-white font-medium">{totalXP} / 3,000 XP</span>
            </div>
            <div className="h-2.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-white transition-all"
                style={{ width: `${Math.min(100, (totalXP / 3000) * 100)}%` }}
              />
            </div>
            <p className="text-white/60 text-xs mt-1.5">{3000 - totalXP} XP to next level</p>
          </div>
          <div className="text-right">
            <p className="text-white/70 text-sm">Achievements</p>
            <p className="text-3xl font-bold">{unlocked}<span className="text-lg text-white/60">/{ACHIEVEMENTS.length}</span></p>
          </div>
        </div>
      </motion.div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {STATS.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border border-border bg-card text-center"
            >
              <Icon size={18} style={{ color: stat.color }} />
              <p className="font-semibold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground leading-tight">{stat.label}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-sm transition-all cursor-pointer ${
                activeCategory === cat
                  ? "bg-[#4f46e5] text-white"
                  : "border border-border hover:bg-accent text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 ml-auto">
          {(["all", "unlocked", "locked"] as const).map(filter => (
            <button
              key={filter}
              onClick={() => setShowUnlocked(filter)}
              className={`px-3 py-1.5 rounded-full text-sm transition-all cursor-pointer capitalize ${
                showUnlocked === filter
                  ? "bg-foreground text-background"
                  : "border border-border hover:bg-accent text-foreground"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Achievements Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((achievement, i) => {
          const Icon = achievement.icon;
          const rarity = RARITY_CONFIG[achievement.rarity];
          const progressPct = achievement.progress != null && achievement.progressMax
            ? (achievement.progress / achievement.progressMax) * 100
            : 0;

          return (
            <motion.div
              key={achievement.id}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04 }}
              className={`relative flex flex-col gap-4 p-5 rounded-2xl border ${
                achievement.unlocked
                  ? `${rarity.border} bg-card`
                  : "border-border bg-card opacity-70"
              } transition-all hover:shadow-sm`}
            >
              {/* Rarity badge */}
              <div
                className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ color: rarity.color, backgroundColor: rarity.color + "15" }}
              >
                {rarity.label}
              </div>

              {/* Icon + title */}
              <div className="flex items-start gap-3 pr-16">
                <div
                  className={`flex items-center justify-center w-12 h-12 rounded-2xl shrink-0 ${
                    achievement.unlocked ? "" : "grayscale opacity-50"
                  }`}
                  style={{
                    backgroundColor: achievement.unlocked ? achievement.bg : "#f3f4f6",
                    color: achievement.unlocked ? achievement.color : "#9ca3af"
                  }}
                >
                  <Icon size={22} />
                </div>
                <div>
                  <p className={`font-medium ${achievement.unlocked ? "text-foreground" : "text-muted-foreground"}`}>
                    {achievement.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{achievement.description}</p>
                </div>
              </div>

              {/* Progress or unlocked */}
              {achievement.unlocked ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-emerald-600 text-sm">
                    <CheckCircle2 size={14} />
                    <span className="text-xs">Unlocked {achievement.unlockedDate}</span>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-xs font-medium">
                    <Star size={11} />
                    +{achievement.xp} XP
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {achievement.progress != null && achievement.progressMax ? (
                    <>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{achievement.progress} / {achievement.progressMax}</span>
                        <span>{Math.round(progressPct)}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${progressPct}%`,
                            backgroundColor: achievement.color
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                      <Lock size={12} />
                      Not started
                    </div>
                  )}
                  <div className="flex items-center gap-1 w-fit px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                    <Star size={11} />
                    {achievement.xp} XP on unlock
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <Trophy size={40} className="opacity-20" />
          <p>No achievements in this category.</p>
        </div>
      )}
    </div>
  );
}
