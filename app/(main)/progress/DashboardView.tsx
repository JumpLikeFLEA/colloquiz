"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  TrendingUp, Clock, Flame, BarChart2, CheckCircle2, XCircle, ChevronRight, Star, Medal
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis
} from "recharts";
import type { EnrichedResult } from "@/lib/questions";
import { formatDuration, pluralize } from "@/lib/format";
import { getLevelProgress } from "@/lib/levels";

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type DashboardViewProps = {
  profile: {
    total_xp: number;
    current_streak: number;
  };
  results: EnrichedResult[];
  /** 7-day standing, or null when the user has no eligible XP this week. */
  myRank: { rank: number; xp: number; total_ranked: number } | null;
};

export function DashboardView({ profile, results, myRank }: DashboardViewProps) {
  const statCards = useMemo(() => {
    const totalTimeSec = results.reduce((a, r) => a + (r.time_taken ?? 0), 0);
    const avgScore =
      results.length === 0
        ? 0
        : Math.round((results.reduce((a, r) => a + r.score, 0) / results.length) * 100);
    // Level and total XP share one card: the level is the headline number and
    // the XP that earned it sits in the card's footnote slot, so progression
    // reads as a stat here rather than as a second identity block.
    const { level } = getLevelProgress(profile.total_xp);
    return [
      { label: "Total Quizzes", value: String(results.length), change: "", icon: BarChart2, color: "#4f46e5", bg: "#eef2ff" },
      { label: "Avg. Score", value: `${avgScore}%`, change: "", icon: TrendingUp, color: "#10b981", bg: "#ecfdf5" },
      { label: "Current Streak", value: pluralize(profile.current_streak, "day"), change: "", icon: Flame, color: "#f97316", bg: "#fff7ed" },
      { label: "Time Spent", value: formatDuration(totalTimeSec, "compact"), change: "", icon: Clock, color: "#8b5cf6", bg: "#f5f3ff" },
      { label: "Current Level", value: `Level ${level}`, change: `${profile.total_xp.toLocaleString()} XP total earned`, icon: Star, color: "#f59e0b", bg: "#fffbeb" },
    ];
  }, [results, profile.current_streak, profile.total_xp]);

  const weeklyData = useMemo(() => {
    const dayScores: Record<string, number[]> = {};
    WEEK_DAYS.forEach(d => { dayScores[d] = []; });

    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);

    for (const r of results) {
      const date = new Date(r.taken_at);
      if (date >= sevenDaysAgo) {
        const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
        if (dayName in dayScores) dayScores[dayName].push(r.score);
      }
    }

    return WEEK_DAYS.map(day => ({
      day,
      score:
        dayScores[day].length > 0
          ? Math.round(
              (dayScores[day].reduce((a, b) => a + b, 0) / dayScores[day].length) * 100,
            )
          : 0,
      quizzes: dayScores[day].length,
    }));
  }, [results]);

  const subjectRadar = useMemo(() => {
    const subjectScores: Record<string, number[]> = {};
    for (const r of results) {
      if (!subjectScores[r.subject]) subjectScores[r.subject] = [];
      subjectScores[r.subject].push(r.score);
    }
    return Object.entries(subjectScores).map(([subject, scores]) => ({
      subject,
      score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100),
    }));
  }, [results]);

  const recentQuizzes = useMemo(
    () =>
      [...results]
        .sort((a, b) => new Date(b.taken_at).getTime() - new Date(a.taken_at).getTime())
        .slice(0, 10),
    [results],
  );

  const difficultyColor = (d: string) => {
    const lower = d.toLowerCase();
    if (lower === "easy") return "text-emerald-600 bg-emerald-50";
    if (lower === "medium") return "text-amber-600 bg-amber-50";
    return "text-red-600 bg-red-50";
  };

  const scoreColor = (s: number) => {
    if (s >= 80) return "text-emerald-600";
    if (s >= 60) return "text-amber-600";
    return "text-red-500";
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="p-5 rounded-2xl border border-border bg-card flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <div
                  className="flex items-center justify-center w-10 h-10 rounded-xl"
                  style={{ backgroundColor: card.bg, color: card.color }}
                >
                  <Icon size={20} />
                </div>
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">{card.value}</p>
                <p className="text-sm text-muted-foreground">{card.label}</p>
              </div>
              <p className="text-xs text-muted-foreground border-t border-border pt-2">{card.change}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Leaderboard standing — rendered only when the user is actually ranked,
          so a new learner is not shown an empty "unranked" tile. */}
      {myRank && (
        <Link
          href="/leaderboard"
          className="flex items-center gap-4 p-5 rounded-2xl border border-border bg-card hover:bg-accent transition-colors"
        >
          <div
            className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
            style={{ backgroundColor: "#fffbeb", color: "#f59e0b" }}
          >
            <Medal size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground leading-none">
              #{myRank.rank} of {myRank.total_ranked} this week
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {myRank.xp.toLocaleString()} XP earned in the last 7 days
            </p>
          </div>
          <ChevronRight size={16} className="text-muted-foreground shrink-0" />
        </Link>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        {/* Weekly performance chart */}
        <div className="p-5 rounded-2xl border border-border bg-card flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Weekly Performance</p>
              <p className="text-xs text-muted-foreground">Average score by day</p>
            </div>
            <span className="text-xs text-muted-foreground px-2 py-1 rounded-lg bg-accent">This week</span>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height: 192 }}>
              <AreaChart data={weeklyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: "13px" }}
                  formatter={(v) => [`${v}%`, "Score"]}
                />
                <Area type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={2} fill="url(#scoreGrad)" dot={{ fill: "#4f46e5", r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Subject radar */}
        <div className="p-5 rounded-2xl border border-border bg-card flex flex-col gap-4">
          <div>
            <p className="font-medium text-foreground">Subject Mastery</p>
            <p className="text-xs text-muted-foreground">Performance by subject</p>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height: 192 }}>
              <RadarChart data={subjectRadar}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                <Radar dataKey="score" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.15} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Quiz History */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-foreground">Recent Quizzes</p>
            <p className="text-xs text-muted-foreground">Your latest quiz results</p>
          </div>
          <button className="text-xs text-[#4f46e5] hover:underline flex items-center gap-1 cursor-pointer">
            View all <ChevronRight size={13} />
          </button>
        </div>

        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <div className="hidden sm:grid grid-cols-[1fr_100px_80px_70px_90px_80px] gap-4 px-5 py-3 bg-accent/50 border-b border-border text-xs text-muted-foreground font-medium">
            <span>Subject / Topic</span>
            <span>Difficulty</span>
            <span>Score</span>
            <span>Questions</span>
            <span>Time</span>
            <span>Date</span>
          </div>
          {results.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              No quizzes yet — start one from Home to see history here.
            </div>
          ) : (
            recentQuizzes.map((r, i) => {
              const passed = r.score >= 0.6;
              const scorePercent = Math.round(r.score * 100);
              const diffDisplay = r.difficulty.charAt(0).toUpperCase() + r.difficulty.slice(1);
              const dateDisplay = new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(r.taken_at));
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_100px_80px_70px_90px_80px] gap-2 sm:gap-4 px-5 py-4 border-b border-border last:border-0 hover:bg-accent/30 transition-colors items-center"
                >
                  <div className="flex items-center gap-3">
                    {passed
                      ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                      : <XCircle size={16} className="text-red-400 shrink-0" />
                    }
                    <div>
                      <p className="text-sm font-medium text-foreground">{r.subject}</p>
                      <p className="text-xs text-muted-foreground">{r.mode.charAt(0).toUpperCase() + r.mode.slice(1)}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit ${difficultyColor(r.difficulty)}`}>
                    {diffDisplay}
                  </span>
                  <span className={`text-sm font-semibold ${scoreColor(scorePercent)}`}>
                    {scorePercent}%
                  </span>
                  <span className="text-sm text-muted-foreground">{r.total_questions} Q</span>
                  <span className="text-sm text-muted-foreground">{formatDuration(r.time_taken ?? 0, "verbose")}</span>
                  <span className="text-xs text-muted-foreground">{dateDisplay}</span>
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
