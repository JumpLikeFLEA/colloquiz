"use client";

import { useState } from "react";
import {
  Trophy, Star, Flame, Zap, BookOpen, Medal, Award, TrendingUp, Clock, Hash, Globe,
  Lock, CheckCircle2, Crown, RefreshCw, Calendar, CalendarCheck, Layers, Play
} from "lucide-react";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { formatDuration, pluralize } from "@/lib/format";
import { XP_PER_LEVEL, getLevelProgress } from "@/lib/levels";

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Star, Award, TrendingUp, CheckCircle: CheckCircle2, RefreshCw, Flame, Zap,
  Calendar, CalendarCheck, Globe, BookOpen, Layers, Play, Trophy, Medal,
};

const CATEGORY_STYLE: Record<string, { color: string; bg: string }> = {
  performance: { color: "#4f46e5", bg: "#eef2ff" },
  consistency:  { color: "#f97316", bg: "#fff7ed" },
  exploration:  { color: "#10b981", bg: "#ecfdf5" },
  volume:       { color: "#8b5cf6", bg: "#f5f3ff" },
};

const RARITY_CONFIG = {
  common:    { label: "Common",    color: "#6b7280", border: "border-gray-200" },
  rare:      { label: "Rare",      color: "#3b82f6", border: "border-blue-200" },
  epic:      { label: "Epic",      color: "#8b5cf6", border: "border-purple-200" },
  legendary: { label: "Legendary", color: "#f59e0b", border: "border-amber-300" },
};

const CATEGORIES = ["All", "performance", "consistency", "exploration", "volume"] as const;
type CategoryFilter = (typeof CATEGORIES)[number];

function getRarity(xpReward: number): keyof typeof RARITY_CONFIG {
  if (xpReward <= 75)  return "common";
  if (xpReward <= 150) return "rare";
  if (xpReward <= 300) return "epic";
  return "legendary";
}

type AchievementsViewProps = {
  totalXp: number;
  currentStreak: number;
  quizCount: number;
  avgScore: number;
  totalTimeSeconds: number;
  unlockedMap: Record<string, string>;
};

export function AchievementsView({
  totalXp,
  currentStreak,
  quizCount,
  avgScore,
  totalTimeSeconds,
  unlockedMap,
}: AchievementsViewProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("All");
  const [showUnlocked, setShowUnlocked] = useState<"all" | "unlocked" | "locked">("all");

  const { level, xpIntoLevel } = getLevelProgress(totalXp);

  const unlockedCount = ACHIEVEMENTS.filter(a => !!unlockedMap[a.id]).length;

  const filtered = ACHIEVEMENTS.filter(a => {
    const catMatch = activeCategory === "All" || a.category === activeCategory;
    const isUnlocked = !!unlockedMap[a.id];
    const lockMatch = showUnlocked === "all" || (showUnlocked === "unlocked" ? isUnlocked : !isUnlocked);
    return catMatch && lockMatch;
  });

  const STATS = [
    { label: "Achievements Unlocked", value: `${unlockedCount} / ${ACHIEVEMENTS.length}`, icon: Trophy, color: "#4f46e5" },
    { label: "Total XP Earned", value: totalXp.toLocaleString(), icon: Star, color: "#f59e0b" },
    { label: "Current Streak", value: pluralize(currentStreak, "day"), icon: Flame, color: "#f97316" },
    { label: "Quizzes Completed", value: String(quizCount), icon: Hash, color: "#10b981" },
    { label: "Avg. Score", value: `${avgScore}%`, icon: TrendingUp, color: "#8b5cf6" },
    { label: "Total Time", value: formatDuration(totalTimeSeconds, "compact"), icon: Clock, color: "#ec4899" },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Level & XP Banner */}
      <div
        className="relative overflow-hidden rounded-2xl p-6 bg-gradient-to-r from-[#4f46e5] to-[#7c3aed] text-white animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-300 motion-reduce:animate-none"
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
              <p className="text-4xl font-bold">{level}</p>
              <p className="text-white/70 text-sm">Advanced Learner</p>
            </div>
          </div>
          <div className="flex-1 max-w-xs">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-white/80">Progress to Level {level + 1}</span>
              <span className="text-white font-medium">{xpIntoLevel} / {XP_PER_LEVEL} XP</span>
            </div>
            <div className="h-2.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-white transition-all"
                style={{ width: `${Math.min(100, (xpIntoLevel / XP_PER_LEVEL) * 100)}%` }}
              />
            </div>
            <p className="text-white/60 text-xs mt-1.5">{XP_PER_LEVEL - xpIntoLevel} XP to next level</p>
          </div>
          <div className="text-right">
            <p className="text-white/70 text-sm">Achievements</p>
            <p className="text-3xl font-bold">{unlockedCount}<span className="text-lg text-white/60">/{ACHIEVEMENTS.length}</span></p>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {STATS.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              style={{ animationDelay: `${i * 0.05}s` }}
              className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border border-border bg-card text-center animate-in fade-in slide-in-from-bottom-[10px] fill-mode-both duration-300 motion-reduce:animate-none"
            >
              <Icon size={18} style={{ color: stat.color }} />
              <p className="font-semibold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground leading-tight">{stat.label}</p>
            </div>
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
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
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
        {filtered.map((a, i) => {
          const Icon = ICON_MAP[a.icon] ?? Trophy;
          const rarity = RARITY_CONFIG[getRarity(a.xpReward)];
          const catStyle = CATEGORY_STYLE[a.category] ?? { color: "#6b7280", bg: "#f3f4f6" };
          const isUnlocked = !!unlockedMap[a.id];
          const unlockedDate = isUnlocked
            ? new Date(unlockedMap[a.id]).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            : undefined;

          return (
            <div
              key={a.id}
              style={{ animationDelay: `${i * 0.04}s` }}
              className={`relative flex flex-col gap-4 p-5 rounded-2xl border ${
                isUnlocked
                  ? `${rarity.border} bg-card`
                  : "border-border bg-card opacity-70"
              } transition-all hover:shadow-sm animate-in fade-in zoom-in-95 fill-mode-both duration-300 motion-reduce:animate-none`}
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
                    isUnlocked ? "" : "grayscale opacity-50"
                  }`}
                  style={{
                    backgroundColor: isUnlocked ? catStyle.bg : "#f3f4f6",
                    color: isUnlocked ? catStyle.color : "#9ca3af",
                  }}
                >
                  <Icon size={22} />
                </div>
                <div>
                  <p className={`font-medium ${isUnlocked ? "text-foreground" : "text-muted-foreground"}`}>
                    {a.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{a.description}</p>
                </div>
              </div>

              {/* Unlocked / locked status */}
              {isUnlocked ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-emerald-600 text-sm">
                    <CheckCircle2 size={14} />
                    <span className="text-xs">Unlocked {unlockedDate}</span>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-xs font-medium">
                    <Star size={11} />
                    +{a.xpReward} XP
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <Lock size={12} />
                    Not started
                  </div>
                  <div className="flex items-center gap-1 w-fit px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                    <Star size={11} />
                    {a.xpReward} XP on unlock
                  </div>
                </div>
              )}
            </div>
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
