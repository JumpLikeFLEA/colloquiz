import { useState } from "react";
import { motion } from "motion/react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Calculator, FlaskConical, Globe, BookOpen, Code, Atom, Leaf,
  Landmark, Palette, Music, Brain, TrendingUp, Languages, Shuffle,
  ChevronRight, Zap
} from "lucide-react";

const SUBJECTS = [
  { id: "mathematics", name: "Mathematics", icon: Calculator, color: "#6366f1", bg: "#eef2ff", topics: 12 },
  { id: "physics", name: "Physics", icon: Atom, color: "#8b5cf6", bg: "#f5f3ff", topics: 10 },
  { id: "chemistry", name: "Chemistry", icon: FlaskConical, color: "#ec4899", bg: "#fdf2f8", topics: 9 },
  { id: "biology", name: "Biology", icon: Leaf, color: "#10b981", bg: "#ecfdf5", topics: 11 },
  { id: "history", name: "History", icon: Landmark, color: "#f59e0b", bg: "#fffbeb", topics: 13 },
  { id: "geography", name: "Geography", icon: Globe, color: "#3b82f6", bg: "#eff6ff", topics: 8 },
  { id: "literature", name: "Literature", icon: BookOpen, color: "#ef4444", bg: "#fef2f2", topics: 10 },
  { id: "computer_science", name: "Computer Science", icon: Code, color: "#06b6d4", bg: "#ecfeff", topics: 15 },
  { id: "economics", name: "Economics", icon: TrendingUp, color: "#f97316", bg: "#fff7ed", topics: 8 },
  { id: "psychology", name: "Psychology", icon: Brain, color: "#a855f7", bg: "#faf5ff", topics: 9 },
  { id: "art", name: "Art & Design", icon: Palette, color: "#f43f5e", bg: "#fff1f2", topics: 7 },
  { id: "music", name: "Music", icon: Music, color: "#14b8a6", bg: "#f0fdfa", topics: 6 },
  { id: "languages", name: "Languages", icon: Languages, color: "#64748b", bg: "#f8fafc", topics: 10 },
  { id: "philosophy", name: "Philosophy", icon: BookOpen, color: "#7c3aed", bg: "#f5f3ff", topics: 7 },
];

const DIFFICULTIES = [
  { id: "easy", label: "Easy", color: "text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100" },
  { id: "medium", label: "Medium", color: "text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100" },
  { id: "hard", label: "Hard", color: "text-red-600 bg-red-50 border-red-200 hover:bg-red-100" },
];

interface MainMenuProps {
  onStartQuiz: (selection: { subjectId: string; difficulty?: string; questionCount?: number }) => void;
}

export function MainMenu({ onStartQuiz }: MainMenuProps) {
  const [selectedDifficulty, setSelectedDifficulty] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");

  const filteredSubjects = SUBJECTS.filter(s =>
    s.name.toLowerCase().includes(filter.toLowerCase())
  );

  const handleStart = (subjectId: string) => {
    const difficulty = selectedDifficulty[subjectId] || "medium";
    onStartQuiz({ subjectId, difficulty, questionCount: 10 });
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-foreground">Basic Quizzes</h1>
            <p className="text-muted-foreground mt-1">10 questions per quiz · Select a subject and difficulty to begin</p>
          </div>
          <button
            onClick={() => {
              const random = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];
              const diffs = ["easy", "medium", "hard"];
              onStartQuiz({ subjectId: random.id, difficulty: diffs[Math.floor(Math.random() * 3)], questionCount: 10 });
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#4f46e5] text-white hover:bg-[#4338ca] transition-colors cursor-pointer"
          >
            <Shuffle size={16} />
            Random Quiz
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search subjects..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-full max-w-sm px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-[#4f46e5]/30 focus:border-[#4f46e5] transition-all"
        />
      </div>

      {/* Subject Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredSubjects.map((subject, i) => {
          const Icon = subject.icon;
          const selectedDiff = selectedDifficulty[subject.id] || null;

          return (
            <motion.div
              key={subject.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              className="group flex flex-col rounded-2xl border border-border bg-card hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
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
                  <p className="text-xs text-muted-foreground">{subject.topics} topics</p>
                </div>
              </div>

              {/* Difficulty selector */}
              <div className="px-4 pb-3">
                <p className="text-xs text-muted-foreground mb-2">Difficulty</p>
                <div className="flex gap-1.5">
                  {DIFFICULTIES.map(diff => (
                    <button
                      key={diff.id}
                      onClick={() => setSelectedDifficulty(prev => ({
                        ...prev,
                        [subject.id]: diff.id
                      }))}
                      className={`flex-1 px-2 py-1.5 rounded-lg border text-xs transition-all cursor-pointer ${
                        selectedDiff === diff.id
                          ? diff.color + " border-current"
                          : "border-border text-muted-foreground hover:border-border hover:bg-accent"
                      }`}
                    >
                      {diff.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Start button */}
              <div className="px-4 pb-4 mt-auto">
                <button
                  onClick={() => handleStart(subject.id)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#4f46e5] text-white hover:bg-[#4338ca] transition-colors text-sm cursor-pointer"
                >
                  <Zap size={14} />
                  Start Quiz
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {filteredSubjects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <BookOpen size={40} className="mb-3 opacity-30" />
          <p>No subjects match your search.</p>
        </div>
      )}
    </div>
  );
}

export { SUBJECTS };
