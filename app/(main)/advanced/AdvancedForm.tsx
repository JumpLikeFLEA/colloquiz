"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ChevronLeft, Settings2, CheckSquare, SlidersHorizontal,
  Hash, Rocket, Calculator, Atom, FlaskConical, Leaf, Landmark, Globe,
  BookOpen, Code, TrendingUp, Brain, Palette, Music, Languages, BarChart3,
  Clapperboard, Trophy, Gamepad2, Microscope, Lightbulb,
  type LucideIcon,
} from "lucide-react";

import type { SubjectCardData } from "@/app/components/SubjectGrid";
import { useStartQuiz } from "@/app/components/StartQuizProvider";
import { slugifyForTag } from "@/lib/utils";

const ICON_MAP: Record<string, LucideIcon> = {
  Calculator, Atom, FlaskConical, Leaf, Landmark, Globe,
  BookOpen, Code, TrendingUp, Brain, Palette, Music, Languages, BarChart3,
  Clapperboard, Trophy, Gamepad2, Microscope, Lightbulb,
};

const STEPS = ["Subject", "Subtopics", "Settings"];

export default function AdvancedForm({
  subjects,
  subtopicsBySubject,
}: {
  subjects: SubjectCardData[];
  subtopicsBySubject: Record<string, string[]>;
}) {
  const { startQuiz } = useStartQuiz();
  const [step, setStep] = useState(0);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedSubtopics, setSelectedSubtopics] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState(5);
  const [questionCount, setQuestionCount] = useState(15);
  const [loading, setLoading] = useState(false);

  const subtopics = selectedSubject ? (subtopicsBySubject[selectedSubject] ?? []) : [];

  const toggleSubtopic = (topic: string) => {
    setSelectedSubtopics(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    );
  };

  const canProceed = () => {
    if (step === 0) return selectedSubject !== null;
    if (step === 1) return selectedSubtopics.length > 0;
    return true;
  };

  const handleLaunch = async () => {
    if (!selectedSubject) return;
    const diffStr = difficulty <= 2 ? "easy" : difficulty <= 5 ? "medium" : "hard";
    setLoading(true);
    try {
      await startQuiz({
        filter: {
          subject: selectedSubject,
          tags: selectedSubtopics.map(slugifyForTag),
          difficulty: diffStr,
          size: questionCount,
          mode: "ordinary",
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const subject = subjects.find(s => s.id === selectedSubject);

  const difficultyLabel = (d: number) => {
    if (d <= 2) return "Beginner";
    if (d <= 4) return "Easy";
    if (d <= 6) return "Medium";
    if (d <= 8) return "Hard";
    return "Expert";
  };

  const difficultyColor = (d: number) => {
    if (d <= 2) return "#10b981";
    if (d <= 4) return "#84cc16";
    if (d <= 6) return "#f59e0b";
    if (d <= 8) return "#f97316";
    return "#ef4444";
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-foreground">Deep Dive</h1>
        <p className="text-muted-foreground mt-1">Customize your quiz with specific topics, difficulty, and question count</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm transition-all ${
                  i < step
                    ? "bg-[#4f46e5] text-white"
                    : i === step
                    ? "bg-[#4f46e5] text-white ring-4 ring-[#4f46e5]/20"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? "✓" : i + 1}
              </div>
              <span className={`text-sm font-medium ${i === step ? "text-foreground" : "text-muted-foreground"}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-8 sm:w-16 ${i < step ? "bg-[#4f46e5]" : "bg-border"} transition-colors`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Settings2 size={16} />
                <span className="text-sm">Choose a subject for your quiz</span>
              </div>
              {subjects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <BookOpen size={40} className="mb-3 opacity-30" />
                  <p>No quizzes available yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {subjects.map(s => {
                    const Icon = ICON_MAP[s.icon] ?? BookOpen;
                    return (
                      <button
                        key={s.id}
                        onClick={() => { setSelectedSubject(s.id); setSelectedSubtopics([]); }}
                        className={`flex flex-col items-center gap-2.5 p-4 rounded-2xl border transition-all cursor-pointer ${
                          selectedSubject === s.id
                            ? "border-[#4f46e5] bg-[#eef2ff]"
                            : "border-border bg-card hover:border-[#4f46e5]/40 hover:bg-accent"
                        }`}
                      >
                        <div
                          className="flex items-center justify-center w-10 h-10 rounded-xl"
                          style={{ backgroundColor: s.bg, color: s.color }}
                        >
                          <Icon size={20} />
                        </div>
                        <span className={`text-sm font-medium text-center leading-tight ${
                          selectedSubject === s.id ? "text-[#4f46e5]" : "text-foreground"
                        }`}>
                          {s.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CheckSquare size={16} />
                  <span className="text-sm">Select subtopics to focus on (select multiple)</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedSubtopics(subtopics)}
                    className="text-xs text-[#4f46e5] hover:underline cursor-pointer"
                  >
                    Select all
                  </button>
                  <span className="text-muted-foreground text-xs">·</span>
                  <button
                    onClick={() => setSelectedSubtopics([])}
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {subject && (() => {
                const Icon = ICON_MAP[subject.icon] ?? BookOpen;
                return (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-accent">
                    <div
                      className="flex items-center justify-center w-7 h-7 rounded-lg"
                      style={{ backgroundColor: subject.bg, color: subject.color }}
                    >
                      <Icon size={14} />
                    </div>
                    <span className="text-sm font-medium">{subject.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{selectedSubtopics.length} selected</span>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {subtopics.map(topic => (
                  <button
                    key={topic}
                    onClick={() => toggleSubtopic(topic)}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-sm transition-all text-left cursor-pointer ${
                      selectedSubtopics.includes(topic)
                        ? "border-[#4f46e5] bg-[#eef2ff] text-[#4f46e5]"
                        : "border-border bg-card hover:border-[#4f46e5]/40 hover:bg-accent text-foreground"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 ${
                      selectedSubtopics.includes(topic)
                        ? "bg-[#4f46e5] border-[#4f46e5]"
                        : "border-muted-foreground/40"
                    }`}>
                      {selectedSubtopics.includes(topic) && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-6 max-w-lg">
              <div className="flex items-center gap-2 text-muted-foreground">
                <SlidersHorizontal size={16} />
                <span className="text-sm">Configure quiz settings</span>
              </div>

              {/* Selected subtopics summary */}
              <div className="p-4 rounded-2xl border border-border bg-accent/50">
                <p className="text-sm font-medium mb-2">Selected focus areas</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedSubtopics.map(t => (
                    <span key={t} className="px-2 py-0.5 rounded-full bg-[#eef2ff] text-[#4f46e5] text-xs">
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="font-medium text-foreground">Difficulty Level</label>
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
                      style={{ backgroundColor: difficultyColor(difficulty) }}
                    >
                      {difficultyLabel(difficulty)}
                    </span>
                    <span className="text-muted-foreground text-sm">{difficulty}/10</span>
                  </div>
                </div>
                <div className="relative pt-2">
                  <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden mb-4">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-full transition-all"
                        style={{ backgroundColor: i < difficulty ? difficultyColor(difficulty) : "#e5e7eb" }}
                      />
                    ))}
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={difficulty}
                    onChange={e => setDifficulty(Number(e.target.value))}
                    className="w-full accent-[#4f46e5] cursor-pointer"
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-muted-foreground">Beginner</span>
                    <span className="text-xs text-muted-foreground">Expert</span>
                  </div>
                </div>
              </div>

              {/* Question count */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 font-medium text-foreground">
                    <Hash size={16} />
                    Number of Questions
                  </label>
                  <span className="text-muted-foreground text-sm">{questionCount} questions</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {[5, 10, 15, 20, 25].map(n => (
                    <button
                      key={n}
                      onClick={() => setQuestionCount(n)}
                      className={`px-2 py-2.5 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
                        questionCount === n
                          ? "border-[#4f46e5] bg-[#eef2ff] text-[#4f46e5]"
                          : "border-border bg-card hover:border-[#4f46e5]/40 text-foreground"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <input
                    type="range"
                    min={3}
                    max={50}
                    value={questionCount}
                    onChange={e => setQuestionCount(Number(e.target.value))}
                    className="flex-1 accent-[#4f46e5] cursor-pointer"
                  />
                  <div className="flex items-center gap-1 border border-border rounded-lg overflow-hidden">
                    <button
                      onClick={() => setQuestionCount(q => Math.max(3, q - 1))}
                      className="px-2.5 py-1.5 hover:bg-accent text-muted-foreground cursor-pointer"
                    >−</button>
                    <span className="px-2 text-sm font-medium w-8 text-center">{questionCount}</span>
                    <button
                      onClick={() => setQuestionCount(q => Math.min(50, q + 1))}
                      className="px-2.5 py-1.5 hover:bg-accent text-muted-foreground cursor-pointer"
                    >+</button>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="p-4 rounded-2xl border border-[#4f46e5]/20 bg-[#eef2ff]">
                <p className="text-sm font-medium text-[#4f46e5] mb-2">Quiz Summary</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Subject: </span>
                    <span className="font-medium">{subject?.name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Topics: </span>
                    <span className="font-medium">{selectedSubtopics.length}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Difficulty: </span>
                    <span className="font-medium">{difficultyLabel(difficulty)} ({difficulty}/10)</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Questions: </span>
                    <span className="font-medium">{questionCount}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => setStep(s => s - 1)}
          disabled={step === 0}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-sm"
        >
          <ChevronLeft size={16} />
          Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep(s => s + 1)}
            disabled={!canProceed()}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#4f46e5] text-white hover:bg-[#4338ca] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-sm"
          >
            Continue
            <ChevronRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleLaunch}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#4f46e5] text-white hover:bg-[#4338ca] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Rocket size={16} />
            {loading ? "Starting…" : "Launch Quiz"}
          </button>
        )}
      </div>
    </div>
  );
}
