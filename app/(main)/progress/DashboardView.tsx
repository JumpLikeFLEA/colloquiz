"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  TrendingUp, Clock, Flame, BarChart2, ChevronRight, Star, Medal, Target
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from "recharts";
import type { BaseTickContentProps } from "recharts/types/util/types";
import type { EnrichedResult } from "@/lib/questions";
import { formatDuration, pluralize } from "@/lib/format";
import { getLevelProgress } from "@/lib/levels";
import { RADAR_MIN_SUBJECTS, type RadarPoint, type SubjectStat } from "@/lib/subjectStats";
import { SubjectScoreBars } from "./SubjectScoreBars";
import { QuizResultsTable } from "./QuizResultsTable";

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Rows the Stats tab shows before sending the user to History. */
const RECENT_QUIZ_ROWS = 10;

/** Baseline-to-baseline spacing for a wrapped axis label, in SVG units. */
const TICK_LINE_HEIGHT = 12;

/**
 * Multi-line polar axis label. Recharts' own tick is a single `<text>` run, which
 * the SVG viewport then clips — that is where "Motion Desi…" and the two
 * indistinguishable "History" axes came from. This renders each pre-wrapped line
 * as its own `<tspan>` and centres the block on the tick, so nothing is ever cut.
 */
function renderSubjectTick(points: RadarPoint[]) {
  const linesBySubject = new Map(points.map(p => [p.subject, p.lines]));

  return function SubjectTick({ x, y, textAnchor, payload, fill }: BaseTickContentProps) {
    const subject = String(payload?.value ?? "");
    const lines = linesBySubject.get(subject) ?? [subject];
    const cx = Number(x);
    const cy = Number(y);
    // Lift the block by half its height so two lines straddle the tick point
    // rather than hanging below it and colliding with the polygon.
    const firstLineOffset = -((lines.length - 1) * TICK_LINE_HEIGHT) / 2;

    return (
      <text x={cx} y={cy} textAnchor={textAnchor} dominantBaseline="central" fontSize={11} fill={fill ?? "#666"}>
        {lines.map((line, i) => (
          <tspan key={line} x={cx} dy={i === 0 ? firstLineOffset : TICK_LINE_HEIGHT}>
            {line}
          </tspan>
        ))}
      </text>
    );
  };
}

/**
 * Stand-in for the radar below three subjects. A two-axis radar is a line and a
 * one-axis radar is a dot — a shape that looks broken rather than empty — so the
 * chart is withheld until it can say something, and the gap says what unlocks it.
 */
function SubjectMasteryEmpty({ played }: { played: number }) {
  const remaining = RADAR_MIN_SUBJECTS - played;
  return (
    <div className="h-80 flex flex-col items-center justify-center gap-3 text-center">
      <div
        className="flex items-center justify-center w-10 h-10 rounded-xl"
        style={{ backgroundColor: "var(--brand-subtle)", color: "var(--brand-text)" }}
      >
        <Target size={20} />
      </div>
      <div>
        <p className="font-medium text-foreground">
          {played === 0
            ? "No subjects played yet"
            : `${pluralize(played, "subject")} so far`}
        </p>
        <p className="text-sm text-muted-foreground mt-1 max-w-[16rem]">
          Play {pluralize(remaining, "more subject")} to compare your strengths side by side.
        </p>
      </div>
      <Link
        href="/"
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-subtle text-brand-text hover:bg-[#e0e7ff] transition-colors text-sm"
      >
        Browse subjects
        <ChevronRight size={14} />
      </Link>
    </div>
  );
}

type DashboardViewProps = {
  profile: {
    total_xp: number;
    current_streak: number;
  };
  results: EnrichedResult[];
  /** 7-day standing, or null when the user has no eligible XP this week. */
  myRank: { rank: number; xp: number; total_ranked: number } | null;
  /** Most-played subjects, capped and labelled for the radar (see lib/subjectStats). */
  radarSubjects: RadarPoint[];
  /** Every attempted subject, strongest first. Same aggregate, different slice. */
  scoreBySubject: SubjectStat[];
};

export function DashboardView({
  profile,
  results,
  myRank,
  radarSubjects,
  scoreBySubject,
}: DashboardViewProps) {
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
    // Five-hue categorical ramp, left as literals by the brand sweep on purpose:
    // tokenising only the indigo would leave one card flipping in dark mode and
    // four not. See the note on CATEGORY_STYLE in AchievementsView.
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

  const subjectTick = useMemo(() => renderSubjectTick(radarSubjects), [radarSubjects]);

  // Stats shows only the latest RECENT_QUIZ_ROWS; the full list lives on the
  // History tab, which "View all" links to.
  const recentQuizzes = useMemo(
    () =>
      [...results]
        .sort((a, b) => new Date(b.taken_at).getTime() - new Date(a.taken_at).getTime())
        .slice(0, RECENT_QUIZ_ROWS),
    [results],
  );

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

      {/* Charts Row. Two equal columns rather than the old [1fr_280px]: the radar
          was squeezed into a 280px card, which is what forced its labels into the
          SVG edge. It has the room now that the profile card is gone. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Weekly performance chart */}
        <div className="p-5 rounded-2xl border border-border bg-card flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Weekly Performance</p>
              <p className="text-xs text-muted-foreground">Average score by day</p>
            </div>
            <span className="text-xs text-muted-foreground px-2 py-1 rounded-lg bg-accent">This week</span>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height: 320 }}>
              <AreaChart data={weeklyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-series-1)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="var(--chart-series-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: "13px" }}
                  formatter={(v) => [`${v}%`, "Score"]}
                />
                <Area type="monotone" dataKey="score" stroke="var(--chart-series-1)" strokeWidth={2} fill="url(#scoreGrad)" dot={{ fill: "var(--chart-series-1)", r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Subject radar — capped at the most-played subjects. Past ~8 axes the
            shape stops being readable, and the catalogue only grows. */}
        <div className="p-5 rounded-2xl border border-border bg-card flex flex-col gap-4">
          <div>
            <p className="font-medium text-foreground">Subject Mastery</p>
            <p className="text-xs text-muted-foreground">
              {radarSubjects.length >= RADAR_MIN_SUBJECTS
                ? `Average score across your ${radarSubjects.length} most-played subjects`
                : "Average score across your most-played subjects"}
            </p>
          </div>
          {radarSubjects.length < RADAR_MIN_SUBJECTS ? (
            <SubjectMasteryEmpty played={radarSubjects.length} />
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 400, height: 320 }}>
                <RadarChart
                  data={radarSubjects}
                  outerRadius="72%"
                  margin={{ top: 16, right: 32, bottom: 16, left: 32 }}
                >
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis dataKey="subject" tick={subjectTick} />
                  {/* Fixed 0–100. Auto-scaling made a flat 45% profile fill the whole
                      polygon, which reads as mastery the user has not earned. */}
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: "13px" }}
                    formatter={(v, _n, item) => [
                      `${v}% · ${pluralize((item?.payload as RadarPoint | undefined)?.quizzes ?? 0, "quiz", "quizzes")}`,
                      "Average",
                    ]}
                  />
                  {/* No fillOpacity: --chart-radar-fill is a complete colour, alpha
                      included, so the two would multiply. It resolves to the same
                      15% indigo here and to a heavier wash in dark, where 15% over
                      a near-black card is invisible. */}
                  <Radar dataKey="avgScore" stroke="var(--chart-series-1)" fill="var(--chart-radar-fill)" strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Average score by subject — every attempted subject, not just the top 8 */}
      <SubjectScoreBars subjects={scoreBySubject} />

      {/* Quiz History */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-foreground">Recent Quizzes</p>
            <p className="text-xs text-muted-foreground">Your latest quiz results</p>
          </div>
          <Link
            href="/progress?tab=history"
            className="text-xs text-brand-text hover:underline flex items-center gap-1"
          >
            View all <ChevronRight size={13} />
          </Link>
        </div>

        <QuizResultsTable
          results={recentQuizzes}
          empty={
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              No quizzes yet — start one from Home to see history here.
            </div>
          }
        />
      </div>
    </div>
  );
}
