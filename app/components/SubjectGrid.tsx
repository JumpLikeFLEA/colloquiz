"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
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
  type LucideIcon,
} from "lucide-react";

import type { Difficulty } from "@/types";
import { cn } from "@/lib/utils";
import {
  DIFFICULTY_FILTERS,
  toQuizDifficulty,
  type DifficultyFilter,
} from "@/lib/difficultyFilter";
import { useStartQuiz } from "@/app/components/StartQuizProvider";
import { pluralize } from "@/lib/format";
import { chipStyle } from "@/lib/categoricalColor";

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
  questionCount: number;
  difficulties: Difficulty[];
};

function difficultyHref(value: DifficultyFilter): string {
  return value === "any" ? "/" : `/?difficulty=${value}`;
}

// Quick Play always asks for a full 10-question quiz, so a subject holding
// fewer than that at the selected difficulty cannot fill one — it is shown
// dimmed and inert rather than left to fail after a click. One constant, since
// the minimum IS the quiz size.
const QUIZ_SIZE = 10;

// The whole card is the start action — twelve identical primary buttons on one
// screen was the thing worth removing. It is a real <button>, so focusability,
// Enter and Space all come from the platform rather than hand-rolled key
// handlers. A <button> may only contain phrasing content, so the inner boxes
// are <span className="block|flex …"> instead of <div>/<p>: same rendering,
// valid HTML, and nothing interactive nested inside an interactive.
// True when the subject cannot fill a quiz at the selected difficulty. Derived
// from questionCount, which is already difficulty-aware, so it re-evaluates on
// every filter change with no state to keep in sync.
function isUnavailable(subject: SubjectCardData): boolean {
  return subject.questionCount < QUIZ_SIZE;
}

function SubjectCard({
  subject,
  difficultyLabel,
  difficultyWord,
  onStart,
  loading,
  index,
}: {
  subject: SubjectCardData;
  difficultyLabel: string;
  difficultyWord: string;
  onStart: (id: string) => void;
  loading: boolean;
  index: number;
}) {
  const Icon = ICON_MAP[subject.icon] ?? BookOpen;
  const n = subject.questionCount;
  const unavailable = isUnavailable(subject);

  // Say the actual number, not just "unavailable" — "Only 3 questions" tells
  // the user the subject is nearly there and worth coming back to, and naming
  // the minimum says why 3 isn't enough.
  const countLine = unavailable
    ? `${n === 0 ? `No ${difficultyWord}questions` : `Only ${pluralize(n, "question")}`} · needs ${QUIZ_SIZE}`
    : pluralize(n, "question");

  // A disabled <button> is already unclickable and out of the tab order, so
  // "non-interactive and not keyboard focusable" needs no tabIndex juggling.
  return (
    <button
      type="button"
      disabled={unavailable || loading}
      aria-busy={loading}
      // The visible text is just the subject and a count; spell out what
      // activating the card does — or why it cannot be activated.
      aria-label={
        unavailable
          ? `${subject.name} — unavailable at ${difficultyLabel}: ${
              n === 0 ? "no questions" : `only ${n} question${n !== 1 ? "s" : ""}`
            }, ${QUIZ_SIZE} needed`
          : `Start ${subject.name} quiz — ${n} question${n !== 1 ? "s" : ""}, ${difficultyLabel}`
      }
      onClick={() => onStart(subject.id)}
      style={{ animationDelay: `${index * 0.03}s` }}
      className={cn(
        "group flex w-full items-center gap-3 p-4 text-left rounded-2xl border border-border bg-card transition-all duration-200 ease-out animate-in fade-in slide-in-from-bottom-4 fill-mode-both motion-reduce:animate-none motion-reduce:transition-none",
        unavailable
          ? // Dimmed but still legible, and still in the grid: the subject
            // exists and is worth returning to at another difficulty.
            "opacity-50 cursor-not-allowed"
          : "cursor-pointer hover:border-brand/40 hover:shadow-md hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60 disabled:cursor-wait",
      )}
    >
      <span
        className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
        style={chipStyle(subject.color)}
      >
        <Icon size={20} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-medium text-foreground truncate">{subject.name}</span>
        <span className="block text-xs text-muted-foreground">{countLine}</span>
      </span>

      {/* The affordance: hidden until the card is hovered or keyboard-focused,
          so the grid stays calm but never looks unclickable once pointed at.
          aria-hidden — the button's own label already says "Start". Omitted
          entirely when unavailable; there is nothing to afford. */}
      {!unavailable && (
        <span
          aria-hidden="true"
          className="flex items-center gap-1 shrink-0 text-xs font-medium text-brand-text opacity-0 -translate-x-1 transition-all duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:translate-x-0 group-disabled:opacity-100 group-disabled:translate-x-0 motion-reduce:transition-none motion-reduce:translate-x-0"
        >
          {loading ? "Starting…" : "Start"}
          {!loading && <ArrowRight size={14} />}
        </span>
      )}
    </button>
  );
}

export function SubjectGrid({
  subjects,
  difficulty,
}: {
  subjects: SubjectCardData[];
  difficulty: DifficultyFilter;
}) {
  const { startQuiz: startQuizFlow } = useStartQuiz();
  const [query, setQuery] = React.useState("");
  const [loadingId, setLoadingId] = React.useState<string | null>(null);

  const filtered = query.trim()
    ? subjects.filter((s) =>
        s.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : subjects;

  // Spoken as part of each card's accessible name, e.g. "…, hard difficulty".
  const difficultyLabel =
    difficulty === "any" ? "any difficulty" : `${difficulty} difficulty`;
  // Inline in "No hard questions"; empty at Any so it reads "No questions".
  const difficultyWord = difficulty === "any" ? "" : `${difficulty} `;

  const trimmedQuery = query.trim();
  // Every card is rendered either way — this only decides whether to also
  // explain the dead end and offer a way out of it.
  const noneAvailable = filtered.length > 0 && filtered.every(isUnavailable);
  const canClearSearch = trimmedQuery !== "";
  const canRelaxDifficulty = difficulty !== "any";

  async function startQuiz(subjectId: string) {
    setLoadingId(subjectId);
    try {
      await startQuizFlow({
        filter: {
          subject: subjectId,
          difficulty: toQuizDifficulty(difficulty),
          size: QUIZ_SIZE,
          mode: "ordinary",
        },
      });
    } finally {
      setLoadingId(null);
    }
  }

  async function startRandom() {
    setLoadingId("__random__");
    try {
      await startQuizFlow({ filter: { difficulty: "mixed", size: QUIZ_SIZE, mode: "ordinary" } });
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
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-white hover:bg-brand-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            <Shuffle size={16} />
            Random Quiz
          </button>
        </div>

        {/* Filter row: search (client-side, instant) + difficulty (URL-driven) */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search subjects..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-w-56 max-w-sm px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
          />

          {/* Real navigations, so these are links with aria-current rather than
              an ARIA radiogroup. scroll={false} keeps the grid in place — the
              search box holds client state that a scroll jump would strand. */}
          <div className="flex items-center gap-1 p-1 rounded-xl border border-border bg-background">
            {DIFFICULTY_FILTERS.map(({ value, label }) => {
              const active = difficulty === value;
              return (
                <Link
                  key={value}
                  href={difficultyHref(value)}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm transition-colors",
                    active
                      ? "bg-brand-subtle text-brand-text font-medium"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Grid. Difficulty never removes a card — an unplayable subject is
          dimmed in place — so this branch is only the truly-empty catalogue. */}
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
        <div className="flex flex-col gap-6">
          {/* Nothing here can be played. Explain it once above the grid rather
              than replacing the grid — the dimmed cards are the point, and
              swapping them for a panel would hide the catalogue. */}
          {noneAvailable && (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-8 text-center">
              <BookOpen size={32} className="text-muted-foreground opacity-30" />
              <div>
                <p className="font-medium text-foreground">
                  {canClearSearch
                    ? `Nothing matching “${trimmedQuery}” has ${QUIZ_SIZE} questions at ${difficultyLabel}`
                    : `No subject has ${QUIZ_SIZE} questions at ${difficultyLabel}`}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Every subject below is short of the {QUIZ_SIZE}-question minimum.
                </p>
              </div>
              {(canClearSearch || canRelaxDifficulty) && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {canRelaxDifficulty && (
                    // Keeps the typed search — only the difficulty is relaxed.
                    <Link
                      href="/"
                      scroll={false}
                      className="inline-flex items-center rounded-xl bg-brand-subtle px-4 py-2 text-sm font-medium text-brand-text transition-colors hover:bg-accent"
                    >
                      Try any difficulty
                    </Link>
                  )}
                  {canClearSearch && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="inline-flex items-center rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground transition-colors cursor-pointer hover:bg-accent"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((s, i) => (
              <SubjectCard
                key={s.id}
                subject={s}
                difficultyLabel={difficultyLabel}
                difficultyWord={difficultyWord}
                onStart={startQuiz}
                loading={loadingId === s.id}
                index={i}
              />
            ))}
          </div>
        </div>
      )}

      {/* Quiet path to the advanced flow — muted so it doesn't compete with the
          subject cards. */}
      <p className="text-center text-sm text-muted-foreground">
        Need more control? Mix subjects, pick subtopics, and set quiz length in{" "}
        <Link href="/advanced" className="text-brand-text font-medium hover:underline">
          Deep Dive →
        </Link>
      </p>
    </div>
  );
}
