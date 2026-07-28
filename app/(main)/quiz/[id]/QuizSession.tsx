"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Clock, CheckCircle2, XCircle, ChevronRight,
  Trophy, RotateCcw, Star, Zap, Target, TrendingUp,
  AlertCircle, BookOpen, Flag, Swords,
  Calculator, Atom, FlaskConical, Leaf, Landmark, Globe,
  Code, Brain, Palette, Music, Languages,
  BarChart3, Clapperboard, Gamepad2, Microscope, Lightbulb,
  type LucideIcon,
} from "lucide-react";
import subjectsData from "@/data/subjects.json";
import { chipStyle } from "@/lib/categoricalColor";
import type { PlayableQuestion, Quiz } from "@/types";
import { ReportQuestionInline } from "@/app/components/ReportQuestion";
import { ShareQuizBlock } from "./ShareQuizBlock";
import { pluralize } from "@/lib/format";
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

const ICON_MAP: Record<string, LucideIcon> = {
  Calculator, Atom, FlaskConical, Leaf, Landmark, Globe, BookOpen, Code,
  TrendingUp, Brain, Palette, Music, Languages, BarChart3, Clapperboard,
  Trophy, Gamepad2, Microscope, Lightbulb,
};

/**
 * Read from data/subjects.json rather than re-declared here. This used to be a
 * hand-copied list of 14 subjects with a hue AND a hardcoded near-white tint
 * each; the tints are gone (chipStyle derives the chip from the hue and the
 * live --card), and copying the hues served no purpose except to drift — the
 * catalogue has grown to 20, so quizzes in the six newer subjects were
 * rendering with no subject chip at all.
 *
 * The hues themselves stay literal in the JSON: a subject's colour is its
 * identity and does not move with the theme. Only the surface under it does.
 */
const SUBJECTS = subjectsData.map(s => ({
  id: s.id,
  name: s.name,
  icon: ICON_MAP[s.icon] ?? BookOpen,
  color: s.color,
}));

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
  /** Present only when this quiz is an active duel leg for the current user.
   *  Drives the duel banner, the server-anchored countdown, and auto-submit. */
  duel: {
    duelId: string;
    opponentName: string;
    startedAt: string;
    timeLimitSeconds: number;
  } | null;
  /** True only for public-bank quizzes a signed-in player may share (page.tsx). */
  shareable: boolean;
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

/**
 * Six-step ordinal ramp, handled like the other ordinal ramps in the app: a
 * fixed hue per step, with the surface derived from the live --card by
 * chipStyle(). Not status tokens — three of those cannot carry six steps, and
 * an "A" is not a success state in the way a correct answer is.
 *
 * The shades are deliberately uneven. Each is the one that clears 3:1 against
 * BOTH its own derived chip and --card, in BOTH themes — the bar for the
 * text-3xl medallion letter (large text) and for the medallion's border, which
 * is a UI component. The -700 blues and reds fail the chip test in dark; the
 * -500 greens and ambers this replaces fail it in light. Do not level them to
 * one shade step.
 *
 * NOTE: the thresholds here (90/80/70/60/50, six letters) do not match
 * getGrade() in results/[id]/page.tsx (90/80/70/60, five letters). That
 * predates this change and is left alone.
 */
function getGrade(pct: number) {
  if (pct >= 90) return { letter: "A+", label: "Excellent!", hue: "#059669" };
  if (pct >= 80) return { letter: "A", label: "Great job!", hue: "#6366f1" };
  if (pct >= 70) return { letter: "B", label: "Good work!", hue: "#2563eb" };
  if (pct >= 60) return { letter: "C", label: "Not bad!", hue: "#a16207" };
  if (pct >= 50) return { letter: "D", label: "Keep going!", hue: "#c2410c" };
  return { letter: "F", label: "Keep practicing!", hue: "#dc2626" };
}

export default function QuizSession({
  quiz,
  questions: initialQuestions,
  initialProgress,
  initialReportedIds,
  startedAt,
  duel,
  shareable,
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
  // Latest answers, so a timeout auto-submit reads current selections rather
  // than a stale closure captured when the countdown effect last ran.
  const answersRef = useRef(answers);
  // Assigned during render on purpose. react-hooks/refs is right that this is
  // unsound under concurrent rendering, but the alternative (syncing in an
  // effect) reintroduces the stale-closure bug this ref exists to fix, on the
  // duel timeout auto-submit path. Revisit together with the countdown effect.
  // eslint-disable-next-line react-hooks/refs
  answersRef.current = answers;

  // Duel countdown. The deadline is server-anchored (the leg's started_at +
  // limit), matching the trigger's timed_out check. Initialised to the full
  // limit — a constant, so server and client first paint agree — then the
  // effect corrects it on mount.
  const duelDeadlineMs = duel
    ? new Date(duel.startedAt).getTime() + duel.timeLimitSeconds * 1000
    : null;
  const [duelRemaining, setDuelRemaining] = useState<number | null>(
    duel ? duel.timeLimitSeconds : null,
  );

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
        const ans = answersRef.current[i];
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

  // Duel timeout: when the server-anchored clock reaches zero, auto-submit
  // whatever's answered so the leg is recorded now instead of waiting for the
  // 3-day deadline sweep. A late leg forfeits either way (the trigger scores a
  // timed-out submission zero), so this only spares the player the wait.
  useEffect(() => {
    if (duelDeadlineMs === null || phase === "results") return;
    const tick = () => {
      const rem = Math.max(0, Math.ceil((duelDeadlineMs - Date.now()) / 1000));
      setDuelRemaining(rem);
      if (rem <= 0 && !submittedRef.current) {
        timer.stop();
        setPhase("results");
        submitResult();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // submitResult reads live state through answersRef; timer.stop is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelDeadlineMs, phase]);

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

  // A solid pill under a white label, so each step has to clear AA against
  // white. The -500 ramp this replaces did not at any step (2.54:1 easy,
  // 2.15:1 medium, 3.76:1 hard); these are the -700 shades of the same hues, at
  // 5.48 / 5.02 / 6.47, and match the difficulty ramp in advanced/AdvancedForm.
  // Fixed hues, so the pill needs no theme variant — it is its own surface.
  const difficultyColor: string = ({
    easy: "#047857",
    medium: "#b45309",
    hard: "#b91c1c",
  } as Record<string, string>)[difficulty] ?? "var(--brand)";

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
        duel={duel}
        shareable={shareable}
        quizId={quiz.id}
      />
    );
  }

  return (
    <div className="flex flex-col gap-0 min-h-full">
      {/* Duel banner + server-anchored countdown */}
      {duel && (
        <div className="flex items-center gap-3 mb-6 p-3.5 rounded-2xl border border-brand/30 bg-brand-subtle">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand text-white shrink-0">
            <Swords size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              Duel vs {duel.opponentName}
            </p>
            <p className="text-xs text-muted-foreground">
              Beat their score before time runs out.
            </p>
          </div>
          {duelRemaining !== null && (
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-mono shrink-0 ${
                duelRemaining <= 60
                  ? "bg-destructive-subtle text-destructive-text"
                  : "bg-card text-foreground"
              }`}
            >
              <Clock size={14} />
              {String(Math.floor(duelRemaining / 60)).padStart(2, "0")}:
              {String(duelRemaining % 60).padStart(2, "0")}
            </div>
          )}
        </div>
      )}

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
              style={chipStyle(subject.color)}
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
            className="h-full rounded-full bg-brand"
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
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-subtle text-brand-text shrink-0 font-medium text-sm">
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
              // Answer states. The colour is the SECOND signal in every case —
              // the letter chip swaps to a check or a cross (below), so the
              // state survives with hue removed entirely. Contrast, light/dark:
              // correct text 5.21 / 7.10, wrong text 4.80 / 5.22, and the
              // letter chips 5.48 / 8.90 and 5.25 / 9.63. All clear AA.
              let optionClass = "border-border bg-card hover:border-brand/50 hover:bg-brand-subtle/50 cursor-pointer";
              let letterClass = "bg-muted text-muted-foreground";
              let textClass = "text-foreground";

              if (phase === "feedback" && selectedOption !== null) {
                if (isCorrectOption) {
                  optionClass = "border-success bg-success-subtle";
                  letterClass = "bg-success text-success-foreground";
                  textClass = "text-success";
                } else if (i === selectedOption && !isCorrectOption) {
                  optionClass = "border-destructive bg-destructive-subtle";
                  letterClass = "bg-destructive text-destructive-foreground";
                  textClass = "text-destructive-text";
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
                className={`flex flex-col gap-3 p-4 rounded-2xl ${isCorrect ? "bg-success-subtle border border-success-border" : "bg-destructive-subtle border border-destructive-border"}`}
              >
                <div className="flex items-center gap-2">
                  {isCorrect ? (
                    <CheckCircle2 size={18} className="text-success shrink-0" />
                  ) : (
                    <XCircle size={18} className="text-destructive-text shrink-0" />
                  )}
                  <p className={`font-medium text-sm ${isCorrect ? "text-success" : "text-destructive-text"}`}>
                    {isCorrect ? "Correct!" : `Incorrect — the answer is "${currentQuestion.correct_answer}"`}
                  </p>
                  <button
                    onClick={() => setShowExplanation(v => !v)}
                    className={`ml-auto text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors ${
                      isCorrect
                        ? "border-success-border text-success hover:bg-success-subtle-hover"
                        : "border-destructive-border text-destructive-text hover:bg-destructive-subtle-hover"
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
                      className={`text-sm ${isCorrect ? "text-success" : "text-destructive-text"}`}
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
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand text-white hover:bg-brand-hover transition-colors cursor-pointer"
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
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive-hover"
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
  duel: Props["duel"];
  shareable: boolean;
  quizId: string;
}

function ResultsScreen({
  questions, answers, score, total, excludedCount, scorePercent, timeFormatted,
  submissionResult, grade, subject, difficulty, reviewExpanded, setReviewExpanded,
  reportedIds, onReported, onBack, onRetry, duel, shareable, quizId
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
      {/* Duel: link back to the duel to see the opponent's leg + outcome */}
      {duel && (
        <Link
          href={`/duels/${duel.duelId}`}
          className="flex items-center gap-3 p-4 rounded-2xl border border-brand/30 bg-brand-subtle hover:bg-brand-subtle-hover transition-colors"
        >
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand text-white shrink-0">
            <Swords size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Duel leg submitted vs {duel.opponentName}
            </p>
            <p className="text-xs text-muted-foreground">
              See the duel status and result →
            </p>
          </div>
        </Link>
      )}

      {/* Hero result */}
      <div
        className="relative overflow-hidden flex flex-col items-center text-center gap-4 p-8 rounded-3xl border"
        style={chipStyle(grade.hue, { border: true })}
      >
        {/* Decorative rings. chipStyle bound the hue to --categorical-color on
            the parent, so these read it back rather than repeating the value. */}
        <div
          className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-10"
          style={{ backgroundColor: "var(--categorical-color)" }}
        />
        <div
          className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full opacity-10"
          style={{ backgroundColor: "var(--categorical-color)" }}
        />

        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
          className="relative flex items-center justify-center w-28 h-28 rounded-full border-4"
          // --card, not white: this medallion sits on the tinted hero, and a
          // hardcoded white disc would stay white on a dark page.
          style={{ borderColor: "var(--categorical-color)", backgroundColor: "var(--card)" }}
        >
          <div className="flex flex-col items-center">
            <span className="text-3xl font-bold" style={{ color: "var(--categorical-color)" }}>{grade.letter}</span>
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
              {subject.name} · {difficulty} · {pluralize(total, "question")}
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
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card/70 backdrop-blur">
            <CheckCircle2 size={16} className="text-success" />
            <span className="text-sm font-medium">{displayCorrect} correct</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card/70 backdrop-blur">
            <XCircle size={16} className="text-destructive-text" />
            <span className="text-sm font-medium">{displayWrong} incorrect</span>
          </div>
          {excludedCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card/70 backdrop-blur">
              <Flag size={16} className="text-muted-foreground" />
              <span className="text-sm font-medium">{excludedCount} reported — not scored</span>
            </div>
          )}
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card/70 backdrop-blur">
            <Clock size={16} className="text-muted-foreground" />
            <span className="text-sm font-medium">{timeFormatted}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card/70 backdrop-blur">
            <Star size={16} className="text-warning" />
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
          // Three icons on a plain card, not a categorical ramp — each maps to
          // a token the app already has, so they follow the theme.
          { label: "Accuracy", value: `${scorePercent}%`, icon: Target, className: "text-brand-text" },
          { label: "XP Earned", value: displayXP !== null ? `+${displayXP}` : "—", icon: Zap, className: "text-warning" },
          { label: "Time", value: timeFormatted, icon: Clock, className: "text-success" },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-border bg-card">
              <Icon size={20} className={stat.className} />
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
        {/* --destructive-text rather than --destructive for the wrong segments:
            the deep fill is only 1.97:1 against the dark page and a 12px bar
            made of it all but disappears, while this reads at 6.89:1 there and
            is unchanged in light. See the a11y note below on hue. */}
        <div className="flex h-3 rounded-full overflow-hidden gap-0.5" role="list">
          {questions.map((q, i) => {
            const ans = answers[i];
            const correct = ans !== null && q.options[ans] === q.correct_answer;
            const state = correct ? "correct" : ans === null ? "not answered" : "incorrect";
            return (
              <motion.div
                key={i}
                role="listitem"
                // This bar distinguishes its states by HUE ALONE — there is no
                // room for an icon in 12px. The label is what carries the state
                // for a screen reader or a red-green colour-blind reader, and
                // the Question Review list below repeats the same information
                // with icons. Do not drop it.
                aria-label={`Question ${i + 1}: ${state}`}
                title={`Q${i + 1}: ${state}`}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.05 * i + 0.5 }}
                style={{ transformOrigin: "left" }}
                className={`flex-1 rounded-sm ${correct ? "bg-success" : ans === null ? "bg-muted" : "bg-destructive-text"}`}
              />
            );
          })}
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-success inline-block" />Correct</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-destructive-text inline-block" />Incorrect</span>
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
                    ? "border-success-border bg-success-subtle/50"
                    : "border-destructive-border bg-destructive-subtle/50"
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
                      ? <CheckCircle2 size={16} className="text-success" />
                      : <XCircle size={16} className="text-destructive-text" />
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
                                    ? "bg-success-subtle-hover text-success"
                                    : isWrongSelected
                                    // opacity-70 removed: it dragged this row —
                                    // the user's OWN wrong answer, which they
                                    // need to read — below AA, and the
                                    // line-through already says "rejected"
                                    // without relying on colour or dimming.
                                    ? "bg-destructive-subtle-hover text-destructive-text line-through"
                                    : "text-muted-foreground"
                                }`}
                              >
                                <span className="font-medium shrink-0">{String.fromCharCode(65 + oi)}.</span>
                                {opt}
                                {isCorrectOpt && <CheckCircle2 size={13} className="ml-auto shrink-0 text-success" />}
                              </div>
                            );
                          })}
                        </div>
                        {q.explanation && (
                          <div className="flex gap-2 mt-1 p-3 rounded-xl bg-card/70">
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

      {/* Share with a friend (public-bank quizzes only) */}
      {shareable && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.52 }}
        >
          <ShareQuizBlock quizId={quizId} />
        </motion.div>
      )}

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
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-brand text-white hover:bg-brand-hover transition-colors cursor-pointer flex-1 sm:flex-none"
        >
          <RotateCcw size={16} />
          Try Again
        </button>
      </motion.div>
    </motion.div>
  );
}
