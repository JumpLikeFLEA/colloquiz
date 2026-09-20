import { useState } from "react";
import { motion } from "motion/react";
import {
  User, Mail, Calendar, MapPin, Edit3, TrendingUp, Target, Clock,
  Award, Flame, BarChart2, CheckCircle2, XCircle, ChevronRight, Star
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis } from "recharts";

const QUIZ_HISTORY = [
  { id: 1, subject: "Mathematics", topic: "Algebra", difficulty: "Medium", score: 90, total: 10, date: "Jun 6, 2026", time: "12m 34s", status: "passed" },
  { id: 2, subject: "Computer Science", topic: "Algorithms", difficulty: "Hard", score: 70, total: 10, date: "Jun 5, 2026", time: "18m 12s", status: "passed" },
  { id: 3, subject: "History", topic: "World Wars", difficulty: "Easy", score: 100, total: 10, date: "Jun 5, 2026", time: "8m 05s", status: "passed" },
  { id: 4, subject: "Physics", topic: "Mechanics", difficulty: "Hard", score: 50, total: 10, date: "Jun 4, 2026", time: "22m 41s", status: "failed" },
  { id: 5, subject: "Biology", topic: "Cell Biology", difficulty: "Medium", score: 80, total: 10, date: "Jun 3, 2026", time: "14m 20s", status: "passed" },
  { id: 6, subject: "Chemistry", topic: "Organic Chemistry", difficulty: "Hard", score: 60, total: 10, date: "Jun 2, 2026", time: "19m 55s", status: "passed" },
  { id: 7, subject: "Geography", topic: "Physical Geography", difficulty: "Easy", score: 90, total: 10, date: "Jun 1, 2026", time: "9m 30s", status: "passed" },
];

const WEEKLY_DATA = [
  { day: "Mon", score: 75, quizzes: 2 },
  { day: "Tue", score: 82, quizzes: 3 },
  { day: "Wed", score: 68, quizzes: 1 },
  { day: "Thu", score: 90, quizzes: 4 },
  { day: "Fri", score: 85, quizzes: 2 },
  { day: "Sat", score: 78, quizzes: 3 },
  { day: "Sun", score: 92, quizzes: 2 },
];

const SUBJECT_RADAR = [
  { subject: "Math", score: 85 },
  { subject: "Science", score: 72 },
  { subject: "History", score: 95 },
  { subject: "CS", score: 78 },
  { subject: "Geography", score: 88 },
  { subject: "Literature", score: 65 },
];

const STAT_CARDS = [
  { label: "Total Quizzes", value: "47", change: "+5 this week", icon: BarChart2, color: "#4f46e5", bg: "#eef2ff" },
  { label: "Avg. Score", value: "81%", change: "+3% vs last week", icon: TrendingUp, color: "#10b981", bg: "#ecfdf5" },
  { label: "Current Streak", value: "7 days", change: "Personal best!", icon: Flame, color: "#f97316", bg: "#fff7ed" },
  { label: "Time Spent", value: "14.2h", change: "This month", icon: Clock, color: "#8b5cf6", bg: "#f5f3ff" },
];

interface DashboardProps {
  onNavigate: (section: string) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState("Alex Johnson");
  const [email, setEmail] = useState("alex.johnson@email.com");
  const [location, setLocation] = useState("New York, USA");

  const difficultyColor = (d: string) => {
    if (d === "Easy") return "text-emerald-600 bg-emerald-50";
    if (d === "Medium") return "text-amber-600 bg-amber-50";
    return "text-red-600 bg-red-50";
  };

  const scoreColor = (s: number) => {
    if (s >= 80) return "text-emerald-600";
    if (s >= 60) return "text-amber-600";
    return "text-red-500";
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Your learning journey at a glance</p>
      </div>

      {/* Profile + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 rounded-2xl border border-border bg-card flex flex-col gap-5"
        >
          <div className="flex items-start justify-between">
            <div className="flex flex-col items-center gap-3 flex-1">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] flex items-center justify-center text-white text-2xl font-medium select-none">
                  {name.split(" ").map(n => n[0]).join("")}
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-card" title="Online" />
              </div>

              {editMode ? (
                <div className="w-full flex flex-col gap-2">
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-border text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/30"
                  />
                  <input
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-border text-xs text-center focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/30"
                  />
                  <input
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-border text-xs text-center focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/30"
                  />
                </div>
              ) : (
                <div className="text-center">
                  <p className="font-medium text-foreground">{name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{email}</p>
                  <p className="text-xs text-muted-foreground">{location}</p>
                </div>
              )}
            </div>
            <button
              onClick={() => setEditMode(e => !e)}
              className="p-1.5 rounded-lg hover:bg-accent transition-colors cursor-pointer shrink-0"
            >
              <Edit3 size={14} className="text-muted-foreground" />
            </button>
          </div>

          {/* Profile info */}
          <div className="flex flex-col gap-2 pt-3 border-t border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User size={13} />
              <span>Level 12 · Advanced Learner</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar size={13} />
              <span>Member since Jan 2026</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin size={13} />
              <span>{location}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Star size={13} className="text-amber-500" />
              <span>2,450 XP total earned</span>
            </div>
          </div>

          {/* XP Progress */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Level 12</span>
              <span>2,450 / 3,000 XP</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[#4f46e5] to-[#7c3aed]" style={{ width: "81.6%" }} />
            </div>
            <p className="text-xs text-muted-foreground">550 XP to Level 13</p>
          </div>

          <button
            onClick={() => onNavigate("achievements")}
            className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-[#eef2ff] text-[#4f46e5] hover:bg-[#e0e7ff] transition-colors text-sm cursor-pointer"
          >
            <Award size={15} />
            View Achievements
            <ChevronRight size={14} />
          </button>
        </motion.div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
          {STAT_CARDS.map((card, i) => {
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
      </div>

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
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={WEEKLY_DATA} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} domain={[50, 100]} />
                <Tooltip
                  contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: "13px" }}
                  formatter={(v: number) => [`${v}%`, "Score"]}
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
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={SUBJECT_RADAR}>
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
          {QUIZ_HISTORY.map((quiz, i) => (
            <motion.div
              key={quiz.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.04 }}
              className="grid grid-cols-1 sm:grid-cols-[1fr_100px_80px_70px_90px_80px] gap-2 sm:gap-4 px-5 py-4 border-b border-border last:border-0 hover:bg-accent/30 transition-colors items-center"
            >
              <div className="flex items-center gap-3">
                {quiz.status === "passed"
                  ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                  : <XCircle size={16} className="text-red-400 shrink-0" />
                }
                <div>
                  <p className="text-sm font-medium text-foreground">{quiz.subject}</p>
                  <p className="text-xs text-muted-foreground">{quiz.topic}</p>
                </div>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit ${difficultyColor(quiz.difficulty)}`}>
                {quiz.difficulty}
              </span>
              <span className={`text-sm font-semibold ${scoreColor(quiz.score)}`}>
                {quiz.score}%
              </span>
              <span className="text-sm text-muted-foreground">{quiz.total} Q</span>
              <span className="text-sm text-muted-foreground">{quiz.time}</span>
              <span className="text-xs text-muted-foreground">{quiz.date}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
