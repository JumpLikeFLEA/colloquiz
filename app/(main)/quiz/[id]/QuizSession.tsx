"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Clock, CheckCircle2, XCircle, ChevronRight,
  Trophy, RotateCcw, Star, Zap, Target, Award, TrendingUp,
  AlertCircle, BookOpen, Flag,
  Calculator, Atom, FlaskConical, Leaf, Landmark, Globe,
  Code, Brain, Palette, Music, Languages
} from "lucide-react";
import type { PlayableQuestion, Quiz } from "@/types";
import { ReportQuestionInline } from "@/app/components/ReportQuestion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";

// Inline subjects for display (same data as figma-export MainMenu SUBJECTS)
const SUBJECTS = [
  { id: "mathematics", name: "Mathematics", icon: Calculator, color: "#6366f1", bg: "#eef2ff" },
  { id: "physics", name: "Physics", icon: Atom, color: "#8b5cf6", bg: "#f5f3ff" },
  { id: "chemistry", name: "Chemistry", icon: FlaskConical, color: "#ec4899", bg: "#fdf2f8" },
  { id: "biology", name: "Biology", icon: Leaf, color: "#10b981", bg: "#ecfdf5" },
  { id: "history", name: "History", icon: Landmark, color: "#f59e0b", bg: "#fffbeb" },
  { id: "geography", name: "Geography", icon: Globe, color: "#3b82f6", bg: "#eff6ff" },
  { id: "literature", name: "Literature", icon: BookOpen, color: "#ef4444", bg: "#fef2f2" },
  { id: "computer_science", name: "Computer Science", icon: Code, color: "#06b6d4", bg: "#ecfeff" },
  { id: "economics", name: "Economics", icon: TrendingUp, color: "#f97316", bg: "#fff7ed" },
  { id: "psychology", name: "Psychology", icon: Brain, color: "#a855f7", bg: "#faf5ff" },
  { id: "art", name: "Art & Design", icon: Palette, color: "#f43f5e", bg: "#fff1f2" },
  { id: "music", name: "Music", icon: Music, color: "#14b8a6", bg: "#f0fdfa" },
  { id: "languages", name: "Languages", icon: Languages, color: "#64748b", bg: "#f8fafc" },
  { id: "philosophy", name: "Philosophy", icon: BookOpen, color: "#7c3aed", bg: "#f5f3ff" },
];

interface Props {
  quiz: Quiz;
  questions: PlayableQuestion[];
  initialProgress: {
    currentIndex: number;
    answers: (number | null)[];
  };
  /** Question ids the user already has an open report on (survives refresh). */
  initialReportedIds: string[];
  /** The session's started_at (ISO). The timer counts from here, so it keeps
   *  running across navigation away and back. */
  startedAt: string;
}

type SubmissionResult = {
  id: string;
  xp: number;
  correctCount: number;
  total: number;
  score: number;
  newAchievements: string[];
};

type Phase = "quiz" | "feedback" | "results";

/**
 * Elapsed time since the session's started_at, read off the wall clock rather
 * than counted up in memory. A tick counter restarts at 0 whenever the
 * component remounts (leaving the quiz and coming back) and is throttled to a
 * crawl in a background tab, so it under-reported the real run time; this is
 * immune to both. Starts at 0 for the first paint so the server and client
 * markup agree, then the effect corrects it on hydration.
 */
function useTimer(startedAtMs: number) {
  const [startMs, setStartMs] = useState(startedAtMs);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return;
    const tick = () =>
      setSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [running, startMs]);

  const stop = useCallback(() => setRunning(false), []);

  /** "Try Again" is a fresh run — time it from now, not from the first attempt. */
  const restart = useCallback(() => {
    setStartMs(Date.now());
    setSeconds(0);
    setRunning(true);
  }, []);

  const formatted = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return { seconds, formatted, stop, restart };
}

function getGrade(pct: number) {
  if (pct >= 90) return { letter: "A+", label: "Excellent!", color: "#10b981", bg: "#ecfdf5" };
  if (pct >= 80) return { letter: "A", label: "Great job!", color: "#6366f1", bg: "#eef2ff" };
  if (pct >= 70) return { letter: "B", label: "Good work!", color: "#3b82f6", bg: "#eff6ff" };
  if (pct >= 60) return { letter: "C", label: "Not bad!", color: "#f59e0b", bg: "#fffbeb" };
  if (pct >= 50) return { letter: "D", label: "Keep going!", color: "#f97316", bg: "#fff7ed" };
  return { letter: "F", label: "Keep practicing!", color: "#ef4444", bg: "#fef2f2" };
}

export default function QuizSession({
  quiz,
  questions: initialQuestions,
  initialProgress,
  initialReportedIds,
  startedAt,
}: Props) {
  const router = useRouter();
  // Resume from saved progress. If the current question was already answered,
  // open it in the "feedback" phase so the prior choice is shown.
  const resumeAnswers =
    initialProgress.answers.length === initialQuestions.length
      ? initialProgress.answers
      : Array(initialQuestions.length).fill(null);
  const resumeAnswered = resumeAnswers[initialProgress.currentIndex] ?? null;

  const [questions, setQuestions] = useState(initialQuestions);
  const [currentIndex, setCurrentIndex] = useState(initialProgress.currentIndex);
  const [selectedOption, setSelectedOption] = useState<number | null>(resumeAnswered);
  const [phase, setPhase] = useState<Phase>(resumeAnswered !== null ? "feedback" : "quiz");
  const [answers, setAnswers] = useState<(number | null)[]>(resumeAnswers);
  const [showExplanation, setShowExplanation] = useState(false);
  const [reviewExpanded, setReviewExpanded] = useState<number | null>(null);
  const [submissionResult, setSubmissionResult] = useState<SubmissionResult | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  // Questions this user has an open report on. Seeded from the server so it
  // survives a refresh; persists across retry — the reports still exist.
  const [reportedIds, setReportedIds] = useState<Set<string>>(
    () => new Set(initialReportedIds),
  );
  const startedAtMs = new Date(startedAt).getTime();
  const timer = useTimer(startedAtMs);
  const submittedRef = useRef(false);

  const markReported = useCallback((questionId: string) => {
    setReportedIds((prev) => new Set(prev).add(questionId));
  }, []);

  // Persist resume progress (and bump last_activity_at) as the user plays.
  // Fire-and-forget — a dropped progress write just means a slightly staler resume.
  const persistProgress = useCallback(
    (index: number, ans: (number | null)[]) => {
      fetch("/api/quiz/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId: quiz.id, currentIndex: index, answers: ans }),
      }).catch(() => {});
    },
    [quiz.id],
  );

  const subjectId = questions[0]?.subject ?? "mathematics";
  const difficulty =
    quiz.difficulty_mix !== "mixed"
      ? quiz.difficulty_mix
      : (() => {
          const diffs = new Set(questions.map((q) => q.difficulty));
          return diffs.size === 1 ? [...diffs][0] : "mixed";
        })();
  const questionCount = questions.length;

  const subject = SUBJECTS.find(s => s.id === subjectId);
  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const progress = ((currentIndex) / totalQuestions) * 100;

  // Correct index for current question (adapts correct_answer string → options index)
  const correctIdx = currentQuestion
    ? currentQuestion.options.indexOf(currentQuestion.correct_answer)
    : -1;

  const correctCount = answers.filter((a, i) =>
    a !== null && questions[i].options[a] === questions[i].correct_answer
  ).length;

  // A reported question the user skipped rather than answered is not scored.
  // Mirrors the server's rule (which is authoritative) so the results screen
  // shows the same numbers the server stored.
  const isExcluded = (i: number) =>
    answers[i] === null && reportedIds.has(questions[i].id);
  const excludedCount = questions.filter((_, i) => isExcluded(i)).length;
  const scoredTotal = totalQuestions - excludedCount;
  const scorePercent =
    scoredTotal > 0 ? Math.round((correctCount / scoredTotal) * 100) : 0;
  const grade = getGrade(scorePercent);

  const handleSelect = (optionIndex: number) => {
    if (phase !== "quiz" || selectedOption !== null) return;
    setSelectedOption(optionIndex);
    const next = [...answers];
    next[currentIndex] = optionIndex;
    setAnswers(next);
    setPhase("feedback");
    persistProgress(currentIndex, next);
  };

  const submitResult = async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    try {
      const answerRecords = questions.map((q, i) => {
        const ans = answers[i];
        return {
          questionId: q.id,
          userAnswer: ans !== null ? q.options[ans] : "",
        };
      });
      const res = await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizId: quiz.id,
          answers: answerRecords,
          timeTaken: timer.seconds,
        }),
      });
      if (!res.ok) {
        console.error("Failed to persist quiz:", await res.text());
        return;
      }
      const data: SubmissionResult = await res.json();
      setSubmissionResult(data);
    } catch (e) {
      console.error("Failed to save quiz result", e);
    }
  };

  const handleNext = () => {
    if (currentIndex < totalQuestions - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setSelectedOption(null);
      setShowExplanation(false);
      setPhase("quiz");
      persistProgress(nextIndex, answers);
    } else {
      timer.stop();
      setPhase("results");
      submitResult();
    }
  };

  // Results screen "Back to Menu" — the session is already completed server-side,
  // so just navigate.
  const handleBack = () => {
    router.push("/");
  };

  // In-quiz "Exit" — confirm, then deactivate the active session.
  const confirmExit = async () => {
    setShowExitConfirm(false);
    try {
      await fetch("/api/quiz/session", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId: quiz.id }),
      });
    } catch {
      // best-effort — navigate away regardless
    }
    router.push("/");
  };

  const handleRetry = () => {
    submittedRef.current = false;
    setSubmissionResult(null);
    const shuffled = [...initialQuestions].sort(() => Math.random() - 0.5);
    setQuestions(shuffled);
    setCurrentIndex(0);
    setSelectedOption(null);
    setPhase("quiz");
    setAnswers(Array(shuffled.length).fill(null));
    setShowExplanation(false);
    setReviewExpanded(null);
    timer.restart();
  };

  const isCorrect = selectedOption !== null && correctIdx !== -1 && selectedOption === correctIdx;

  const difficultyColor: string = ({
    easy: "#10b981",
    medium: "#f59e0b",
    hard: "#ef4444",
  } as Record<string, string>)[difficulty] ?? "#6366f1";

  if (phase === "results") {
    return (
      <ResultsScreen
        questions={questions}
        answers={answers}
        score={correctCount}
        total={scoredTotal}
        excludedCount={excludedCount}
        scorePercent={scorePercent}
        timeFormatted={timer.formatted}
        submissionResult={submissionResult}
        grade={grade}
        subject={subject}
        difficulty={difficulty}
        reviewExpanded={reviewExpanded}
        setReviewExpanded={setReviewExpanded}
        reportedIds={reportedIds}
        onReported={markReported}
        onBack={handleBack}
        onRetry={handleRetry}
      />
    );
  }

  return (
    <div className="flex flex-col gap-0 min-h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <button
          onClick={() => setShowExitConfirm(true)}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm cursor-pointer"
        >
          <ArrowLeft size={16} />
          Exit
        </button>

        <div className="flex items-center gap-3">
          {subject && (
            <div
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
              style={{ backgroundColor: subject.bg, color: subject.color }}
            >
              <subject.icon size={13} />
              {subject.name}
            </div>
          )}
          <span
            className="px-3 py-1 rounded-full text-xs font-medium capitalize text-white"
            style={{ backgroundColor: difficultyColor }}
          >
            {difficulty}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
          <Clock size={15} />
          <span className="font-mono">{timer.formatted}</span>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3 mb-8">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-[#4f46e5]"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
        <span className="text-sm text-muted-foreground shrink-0 tabular-nums">
          {currentIndex + 1} / {totalQuestions}
        </span>
      </div>

      {/* Question card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex flex-col gap-6"
        >
          {/* Question */}
          <div className="flex flex-col gap-4 p-6 rounded-2xl border border-border bg-card">
            <div className="flex items-start gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[#eef2ff] text-[#4f46e5] shrink-0 font-medium text-sm">
                {currentIndex + 1}
              </span>
              <p className="text-foreground leading-relaxed pt-1">{currentQuestion.question}</p>
            </div>
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {currentQuestion.options.map((option, i) => {
              const letter = String.fromCharCode(65 + i);
              const isCorrectOption = currentQuestion.options[i] === currentQuestion.correct_answer;
              let optionClass = "border-border bg-card hover:border-[#4f46e5]/50 hover:bg-[#eef2ff]/50 cursor-pointer";
              let letterClass = "bg-muted text-muted-foreground";
              let textClass = "text-foreground";

              if (phase === "feedback" && selectedOption !== null) {
                if (isCorrectOption) {
                  optionClass = "border-emerald-400 bg-emerald-50";
                  letterClass = "bg-emerald-500 text-white";
                  textClass = "text-emerald-800";
                } else if (i === selectedOption && !isCorrectOption) {
                  optionClass = "border-red-400 bg-red-50";
                  letterClass = "bg-red-500 text-white";
                  textClass = "text-red-800";
                } else {
                  optionClass = "border-border bg-card opacity-50 cursor-default";
                  letterClass = "bg-muted text-muted-foreground";
                }
              }

              return (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  onClick={() => handleSelect(i)}
                  disabled={phase === "feedback"}
                  className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all w-full ${optionClass}`}
                >
                  <span className={`flex items-center justify-center w-8 h-8 rounded-xl shrink-0 text-sm font-semibold transition-all ${letterClass}`}>
                    {phase === "feedback" && isCorrectOption ? (
                      <CheckCircle2 size={16} />
                    ) : phase === "feedback" && i === selectedOption && !isCorrectOption ? (
                      <XCircle size={16} />
                    ) : letter}
                  </span>
                  <span className={`text-sm leading-snug transition-colors ${textClass}`}>{option}</span>
                </motion.button>
              );
            })}
          </div>

          {/* Report question — inline, below the options */}
          <ReportQuestionInline
            questionId={currentQuestion.id}
            selectedAnswer={selectedOption !== null ? currentQuestion.options[selectedOption] : null}
            reported={reportedIds.has(currentQuestion.id)}
            onReported={markReported}
          />

          {/* Feedback area */}
          <AnimatePresence>
            {phase === "feedback" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex flex-col gap-3 p-4 rounded-2xl ${isCorrect ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}
              >
                <div className="flex items-center gap-2">
                  {isCorrect ? (
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle size={18} className="text-red-500 shrink-0" />
                  )}
                  <p className={`font-medium text-sm ${isCorrect ? "text-emerald-700" : "text-red-700"}`}>
                    {isCorrect ? "Correct!" : `Incorrect — the answer is "${currentQuestion.correct_answer}"`}
                  </p>
                  <button
                    onClick={() => setShowExplanation(v => !v)}
                    className={`ml-auto text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors ${
                      isCorrect
                        ? "border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                        : "border-red-300 text-red-700 hover:bg-red-100"
                    }`}
                  >
                    {showExplanation ? "Hide" : "Explain"}
                  </button>
                </div>
                <AnimatePresence>
                  {showExplanation && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className={`text-sm ${isCorrect ? "text-emerald-700" : "text-red-700"}`}
                    >
                      {currentQuestion.explanation}
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Skip — only for a reported question the user hasn't answered.
              Leaves answers[currentIndex] = null, which marks it as skipped;
              the server excludes it from scoring once it verifies the report. */}
          {phase === "quiz" &&
            selectedOption === null &&
            reportedIds.has(currentQuestion.id) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-end gap-2"
              >
                <button
                  onClick={handleNext}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl border border-border text-foreground hover:bg-accent transition-colors cursor-pointer"
                >
                  {currentIndex < totalQuestions - 1 ? (
                    <>Skip question <ChevronRight size={16} /></>
                  ) : (
                    <>Skip &amp; view results <Trophy size={16} /></>
                  )}
                </button>
                <p className="text-xs text-muted-foreground">
                  You reported this question — skip it and it won&apos;t count towards your score.
                </p>
              </motion.div>
            )}

          {/* Navigation */}
          {phase === "feedback" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-end"
            >
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#4f46e5] text-white hover:bg-[#4338ca] transition-colors cursor-pointer"
              >
                {currentIndex < totalQuestions - 1 ? (
                  <>Next question <ChevronRight size={16} /></>
                ) : (
                  <>View results <Trophy size={16} /></>
                )}
              </button>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>

      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exit this quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              Your quiz will be deactivated and its progress discarded. You can start a new
              quiz afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Keep going</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmExit}
              className="rounded-xl bg-red-500 text-white hover:bg-red-600"
            >
              Exit quiz
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ResultsScreenProps {
  questions: PlayableQuestion[];
  answers: (number | null)[];
  score: number;
  /** Scored questions only — reported+skipped ones are excluded. */
  total: number;
  excludedCount: number;
  scorePercent: number;
  timeFormatted: string;
  submissionResult: SubmissionResult | null;
  grade: ReturnType<typeof getGrade>;
  subject: (typeof SUBJECTS)[0] | undefined;
  difficulty: string;
  reviewExpanded: number | null;
  setReviewExpanded: (n: number | null) => void;
  reportedIds: Set<string>;
  onReported: (questionId: string) => void;
  onBack: () => void;
  onRetry: () => void;
}

function ResultsScreen({
  questions, answers, score, total, excludedCount, scorePercent, timeFormatted,
  submissionResult, grade, subject, difficulty, reviewExpanded, setReviewExpanded,
  reportedIds, onReported, onBack, onRetry
}: ResultsScreenProps) {
  const displayCorrect = submissionResult?.correctCount ?? score;
  const displayWrong = total - displayCorrect;
  const displayXP: number | null = submissionResult?.xp ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col gap-8"
    >
      {/* Hero result */}
      <div
        className="relative overflow-hidden flex flex-col items-center text-center gap-4 p-8 rounded-3xl border"
        style={{ backgroundColor: grade.bg, borderColor: grade.color + "40" }}
      >
        {/* Decorative rings */}
        <div
          className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-10"
          style={{ backgroundColor: grade.color }}
        />
        <div
          className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full opacity-10"
          style={{ backgroundColor: grade.color }}
        />

        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
          className="relative flex items-center justify-center w-28 h-28 rounded-full border-4"
          style={{ borderColor: grade.color, backgroundColor: "white" }}
        >
          <div className="flex flex-col items-center">
            <span className="text-3xl font-bold" style={{ color: grade.color }}>{grade.letter}</span>
            <span className="text-lg font-semibold text-foreground">{scorePercent}%</span>
          </div>
        </motion.div>

        <div>
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-foreground"
          >
            {grade.label}
          </motion.h2>
          {subject && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-muted-foreground mt-1 text-sm"
            >
              {subject.name} · {difficulty} · {total} questions
            </motion.p>
          )}
        </div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="flex gap-5 flex-wrap justify-center"
        >
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/70 backdrop-blur">
            <CheckCircle2 size={16} className="text-emerald-500" />
            <span className="text-sm font-medium">{displayCorrect} correct</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/70 backdrop-blur">
            <XCircle size={16} className="text-red-400" />
            <span className="text-sm font-medium">{displayWrong} incorrect</span>
          </div>
          {excludedCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/70 backdrop-blur">
              <Flag size={16} className="text-muted-foreground" />
              <span className="text-sm font-medium">{excludedCount} reported — not scored</span>
            </div>
          )}
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/70 backdrop-blur">
            <Clock size={16} className="text-muted-foreground" />
            <span className="text-sm font-medium">{timeFormatted}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/70 backdrop-blur">
            <Star size={16} className="text-amber-500" />
            <span className="text-sm font-medium">{displayXP !== null ? `+${displayXP}` : "—"} XP</span>
          </div>
        </motion.div>
      </div>

      {/* Performance breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="grid grid-cols-3 gap-4"
      >
        {[
          { label: "Accuracy", value: `${scorePercent}%`, icon: Target, color: "#4f46e5" },
          { label: "XP Earned", value: displayXP !== null ? `+${displayXP}` : "—", icon: Zap, color: "#f59e0b" },
          { label: "Time", value: timeFormatted, icon: Clock, color: "#10b981" },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-border bg-card">
              <Icon size={20} style={{ color: stat.color }} />
              <p className="font-semibold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          );
        })}
      </motion.div>

      {/* Score bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45 }}
        className="flex flex-col gap-2"
      >
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Score breakdown</span>
          <span>{displayCorrect}/{total} correct</span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
          {questions.map((q, i) => {
            const ans = answers[i];
            const correct = ans !== null && q.options[ans] === q.correct_answer;
            return (
              <motion.div
                key={i}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.05 * i + 0.5 }}
                style={{ transformOrigin: "left" }}
                className={`flex-1 rounded-sm ${correct ? "bg-emerald-500" : ans === null ? "bg-muted" : "bg-red-400"}`}
              />
            );
          })}
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />Correct</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />Incorrect</span>
        </div>
      </motion.div>

      {/* Question review */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex flex-col gap-3"
      >
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-muted-foreground" />
          <p className="font-medium text-foreground">Question Review</p>
        </div>

        <div className="flex flex-col gap-2">
          {questions.map((q, i) => {
            const ans = answers[i];
            // Reported and skipped — not scored, so neither correct nor wrong.
            const excluded = ans === null && reportedIds.has(q.id);
            const correct = ans !== null && q.options[ans] === q.correct_answer;
            const isOpen = reviewExpanded === i;

            return (
              <div
                key={i}
                className={`rounded-2xl border overflow-hidden transition-all ${
                  excluded
                    ? "border-border bg-muted/40"
                    : correct
                    ? "border-emerald-200 bg-emerald-50/50"
                    : "border-red-200 bg-red-50/50"
                }`}
              >
                <button
                  onClick={() => setReviewExpanded(isOpen ? null : i)}
                  className="flex items-start gap-3 w-full p-4 text-left cursor-pointer"
                >
                  <span className="shrink-0 mt-0.5">
                    {excluded
                      ? <Flag size={16} className="text-muted-foreground" />
                      : correct
                      ? <CheckCircle2 size={16} className="text-emerald-500" />
                      : <XCircle size={16} className="text-red-400" />
                    }
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-muted-foreground">
                      Q{i + 1}{excluded && " · Reported — not scored"}
                    </span>
                    <p className="text-sm text-foreground leading-snug line-clamp-2">{q.question}</p>
                  </div>
                  <ChevronRight
                    size={15}
                    className={`shrink-0 text-muted-foreground transition-transform mt-0.5 ${isOpen ? "rotate-90" : ""}`}
                  />
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 flex flex-col gap-2 border-t border-current/10 pt-3">
                        <div className="flex flex-col gap-1.5">
                          {q.options.map((opt, oi) => {
                            const isCorrectOpt = opt === q.correct_answer;
                            const isWrongSelected = oi === ans && !isCorrectOpt;
                            return (
                              <div
                                key={oi}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${
                                  isCorrectOpt
                                    ? "bg-emerald-100 text-emerald-800"
                                    : isWrongSelected
                                    ? "bg-red-100 text-red-700 line-through opacity-70"
                                    : "text-muted-foreground"
                                }`}
                              >
                                <span className="font-medium shrink-0">{String.fromCharCode(65 + oi)}.</span>
                                {opt}
                                {isCorrectOpt && <CheckCircle2 size={13} className="ml-auto shrink-0 text-emerald-600" />}
                              </div>
                            );
                          })}
                        </div>
                        {q.explanation && (
                          <div className="flex gap-2 mt-1 p-3 rounded-xl bg-white/70">
                            <AlertCircle size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                            <p className="text-xs text-muted-foreground">{q.explanation}</p>
                          </div>
                        )}
                        <div className="mt-1">
                          <ReportQuestionInline
                            questionId={q.id}
                            selectedAnswer={ans !== null ? q.options[ans] : null}
                            reported={reportedIds.has(q.id)}
                            onReported={onReported}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Action buttons */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
        className="flex flex-col sm:flex-row gap-3 pb-4"
      >
        <button
          onClick={onBack}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-border hover:bg-accent transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} />
          Back to Menu
        </button>
        <button
          onClick={onRetry}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#4f46e5] text-white hover:bg-[#4338ca] transition-colors cursor-pointer flex-1 sm:flex-none"
        >
          <RotateCcw size={16} />
          Try Again
        </button>
      </motion.div>
    </motion.div>
  );
}
