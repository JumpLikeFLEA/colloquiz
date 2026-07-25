"use client";

import * as React from "react";
import Link from "next/link";
import {
  Atom,
  BookOpen,
  Brain,
  Calculator,
  Clapperboard,
  Code,
  Trophy,
  Gamepad2,
  Microscope,
  FlaskConical,
  Globe,
  Languages,
  Landmark,
  Leaf,
  Lightbulb,
  Music,
  Palette,
  Shuffle,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { Difficulty } from "@/types";
import { useStartQuiz } from "@/app/components/StartQuizProvider";

const ICON_MAP: Record<string, LucideIcon> = {
  Calculator,
  Atom,
  FlaskConical,
  Leaf,
  Landmark,
  Globe,
  BookOpen,
  Code,
  TrendingUp,
  Brain,
  Palette,
  Music,
  Languages,
  Clapperboard,
  Trophy,
  Gamepad2,
  Microscope,
  Lightbulb,
};

export type SubjectCardData = {
  id: string;
  name: string;
  icon: string;
  color: string;
  bg: string;
  questionCount: number;
  difficulties: Difficulty[];
};

const DIFFICULTY_STYLES: Record<
  Difficulty,
  { active: string; label: string }
> = {
  easy: {
    active:
      "text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100",
    label: "Easy",
  },
  medium: {
    active:
      "text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100",
    label: "Medium",
  },
  hard: {
    active: "text-red-600 bg-red-50 border-red-200 hover:bg-red-100",
    label: "Hard",
  },
};

const ALL_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

// The card's default: questions from every difficulty the subject has. Selected
// out of the box, so Start Quiz always works and the card has no error state.
// Same value Random Quiz and the Build wizard send.
type CardDifficulty = Difficulty | "mixed";

const MIXED_ACTIVE =
  "text-indigo-600 bg-indigo-50 border-indigo-200 hover:bg-indigo-100";

function SubjectCard({
  subject,
  selectedDiff,
  onSelectDiff,
  onStart,
  loading,
  index,
}: {
  subject: SubjectCardData;
  selectedDiff: CardDifficulty;
  onSelectDiff: (id: string, diff: CardDifficulty) => void;
  onStart: (id: string, diff: CardDifficulty) => void;
  loading: boolean;
  index: number;
}) {
  const Icon = ICON_MAP[subject.icon] ?? BookOpen;

  return (
    <div
      style={{ animationDelay: `${index * 0.03}s` }}
      className="group flex flex-col rounded-2xl border border-border bg-card hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 animate-in fade-in slide-in-from-bottom-4 fill-mode-both motion-reduce:animate-none"
    >
      {/* Subject header */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
          style={{ backgroundColor: subject.bg, color: subject.color }}
        >
          <Icon size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate">{subject.name}</p>
          <p className="text-xs text-muted-foreground">
            {`${subject.questionCount} question${subject.questionCount !== 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      {/* Difficulty selector */}
      <div className="px-4 pb-3">
        <p className="text-xs text-muted-foreground mb-2">Difficulty</p>
        <div className="flex gap-1.5">
          {ALL_DIFFICULTIES.map((diff) => {
            const style = DIFFICULTY_STYLES[diff];
            const isAvailable = subject.difficulties.includes(diff);
            const isSelected = selectedDiff === diff;
            return (
              <button
                key={diff}
                disabled={!isAvailable}
                onClick={() => onSelectDiff(subject.id, diff)}
                className={`flex-1 px-2 py-1.5 rounded-lg border text-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  isSelected
                    ? style.active + " border-current"
                    : "border-border text-muted-foreground hover:border-border hover:bg-accent"
                }`}
              >
                {style.label}
              </button>
            );
          })}
        </div>
        {/* The default. Full-width on its own row so it reads as "no preference"
            rather than as a fourth difficulty — and so four pills never have to
            share one row at the 4-column breakpoint. */}
        <button
          onClick={() => onSelectDiff(subject.id, "mixed")}
          className={`w-full mt-1.5 px-2 py-1.5 rounded-lg border text-xs transition-all cursor-pointer ${
            selectedDiff === "mixed"
              ? MIXED_ACTIVE + " border-current"
              : "border-border text-muted-foreground hover:border-border hover:bg-accent"
          }`}
        >
          Any difficulty
        </button>
      </div>

      {/* Start button */}
      <div className="px-4 pb-4 mt-auto">
        <button
          disabled={loading}
          onClick={() => onStart(subject.id, selectedDiff)}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#4f46e5] text-white hover:bg-[#4338ca] transition-colors text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Zap size={14} />
          {loading ? "Starting…" : "Start Quiz"}
        </button>
      </div>
    </div>
  );
}

export function SubjectGrid({ subjects }: { subjects: SubjectCardData[] }) {
  const { startQuiz: startQuizFlow } = useStartQuiz();
  const [query, setQuery] = React.useState("");
  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  // Sparse — a subject with no entry falls back to "mixed" at render, so there
  // is nothing to seed and every card starts out startable.
  const [selectedDifficulty, setSelectedDifficulty] = React.useState<
    Record<string, CardDifficulty>
  >({});

  const filtered = query.trim()
    ? subjects.filter((s) =>
        s.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : subjects;

  function selectDiff(subjectId: string, diff: CardDifficulty) {
    setSelectedDifficulty((prev) => ({ ...prev, [subjectId]: diff }));
  }

  async function startQuiz(subjectId: string, difficulty: CardDifficulty) {
    setLoadingId(subjectId);
    try {
      await startQuizFlow({
        filter: { subject: subjectId, difficulty, size: 10, mode: "ordinary" },
      });
    } finally {
      setLoadingId(null);
    }
  }

  async function startRandom() {
    setLoadingId("__random__");
    try {
      await startQuizFlow({ filter: { difficulty: "mixed", size: 10, mode: "ordinary" } });
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-foreground">Quick Play</h1>
            <p className="text-muted-foreground mt-1">
              10 questions from different subtopics · Select a subject and difficulty to begin
            </p>
          </div>
          <button
            onClick={startRandom}
            disabled={loadingId === "__random__"}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#4f46e5] text-white hover:bg-[#4338ca] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            <Shuffle size={16} />
            Random Quiz
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search subjects..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-sm px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-[#4f46e5]/30 focus:border-[#4f46e5] transition-all"
        />
      </div>

      {/* Grid */}
      {subjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <BookOpen size={40} className="mb-3 opacity-30" />
          <p>No quizzes available yet</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <BookOpen size={40} className="mb-3 opacity-30" />
          <p>No subjects match &ldquo;{query}&rdquo;</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((s, i) => (
            <SubjectCard
              key={s.id}
              subject={s}
              selectedDiff={selectedDifficulty[s.id] ?? "mixed"}
              onSelectDiff={selectDiff}
              onStart={startQuiz}
              loading={loadingId === s.id}
              index={i}
            />
          ))}
        </div>
      )}

      {/* Quiet path to the advanced flow — muted so it doesn't compete with the
          per-card Start Quiz buttons. */}
      <p className="text-center text-sm text-muted-foreground">
        Need more control? Mix subjects, pick subtopics, and set quiz length in{" "}
        <Link href="/advanced" className="text-brand font-medium hover:underline">
          Deep Dive →
        </Link>
      </p>
    </div>
  );
}
