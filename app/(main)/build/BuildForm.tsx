"use client";

import * as React from "react";
import {
  Atom,
  BookOpen,
  Brain,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Code,
  FlaskConical,
  Gamepad2,
  Globe,
  Languages,
  Landmark,
  Leaf,
  Microscope,
  Music,
  Palette,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { cn, slugifyForTag } from "@/lib/utils";
import type { Difficulty, QuizMode, QuizSize } from "@/types";
import type { SubjectCardData } from "@/app/components/SubjectGrid";
import { useStartQuiz } from "@/app/components/StartQuizProvider";

// ── Icon map ────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Calculator, Atom, FlaskConical, Leaf, Landmark, Globe,
  BookOpen, Code, TrendingUp, Brain, Palette, Music, Languages, Clapperboard, Trophy, Gamepad2, Microscope,
};

// ── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

interface WizardState {
  step: Step;
  subjectId: string | null;
  subtopics: string[];
  difficulty: Difficulty | "mixed";
  size: QuizSize;
  mode: QuizMode;
}

// ── Progress bar ─────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: Step }) {
  const steps = ["Subject", "Subtopics", "Settings"];
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => {
        const n = (i + 1) as Step;
        const done = step > n;
        const active = step === n;
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  done && "bg-primary text-primary-foreground",
                  active && "border-2 border-primary text-primary",
                  !done && !active && "border-2 border-muted-foreground/30 text-muted-foreground",
                )}
              >
                {done ? "✓" : n}
              </div>
              <span
                className={cn(
                  "text-xs",
                  active ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "mb-4 h-px flex-1 transition-colors",
                  step > n ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Step 1 — Subject ─────────────────────────────────────────────────────────

function Step1({
  subjects,
  selected,
  onSelect,
}: {
  subjects: SubjectCardData[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose a subject, or leave blank for a mixed quiz.
      </p>

      {/* Any subject card */}
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "w-full rounded-xl border p-4 text-left transition-colors hover:bg-accent",
          selected === null && "border-primary bg-primary/5",
        )}
      >
        <p className="font-medium">Any Subject</p>
        <p className="text-sm text-muted-foreground">Pick from the full question pool</p>
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        {subjects.map((s) => {
          const Icon = ICON_MAP[s.icon] ?? BookOpen;
          const active = selected === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              disabled={s.questionCount === 0}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed",
                active && "border-primary bg-primary/5",
              )}
            >
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                style={{ background: s.bg }}
              >
                <Icon className="size-4" style={{ color: s.color }} />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {s.questionCount === 0 ? "No questions" : `${s.questionCount} questions`}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 2 — Subtopics ───────────────────────────────────────────────────────

function Step2({
  subjectName,
  subtopics,
  selected,
  onChange,
}: {
  subjectName: string;
  subtopics: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(s: string) {
    onChange(selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s]);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Narrow <span className="font-medium text-foreground">{subjectName}</span> by subtopic.
        Leave all unchecked to include every subtopic.
      </p>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => onChange([...subtopics])}>
          Select all
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onChange([])}>
          Clear
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {subtopics.map((s) => (
          <label
            key={s}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 transition-colors hover:bg-accent"
          >
            <Checkbox
              checked={selected.includes(s)}
              onCheckedChange={() => toggle(s)}
            />
            <span className="text-sm">{s}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Step 3 — Settings ────────────────────────────────────────────────────────

const DIFFICULTIES: Array<Difficulty | "mixed"> = ["easy", "medium", "hard", "mixed"];
const SIZES: QuizSize[] = [5, 10, 20];

function PillGroup<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  label: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o)}
          onClick={() => onChange(o)}
          className={cn(
            "rounded-lg border px-4 py-1.5 text-sm capitalize transition-colors",
            value === o
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:bg-accent",
          )}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

function Step3({
  difficulty,
  size,
  mode,
  onChange,
}: {
  difficulty: Difficulty | "mixed";
  size: QuizSize;
  mode: QuizMode;
  onChange: (patch: Partial<{ difficulty: Difficulty | "mixed"; size: QuizSize; mode: QuizMode }>) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium">Difficulty</p>
        <PillGroup
          options={DIFFICULTIES}
          value={difficulty}
          onChange={(v) => onChange({ difficulty: v })}
          label={(v) => v}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Mode</p>
        <PillGroup
          options={["ordinary", "exam"] as QuizMode[]}
          value={mode}
          onChange={(v) => onChange({ mode: v })}
          label={(v) => (v === "exam" ? "Exam (50 questions)" : "Ordinary")}
        />
      </div>

      {mode === "ordinary" && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Number of questions</p>
          <PillGroup
            options={SIZES}
            value={size}
            onChange={(v) => onChange({ size: v })}
            label={(v) => String(v)}
          />
        </div>
      )}
    </div>
  );
}

// ── Root wizard ───────────────────────────────────────────────────────────────

export default function BuildForm({
  subjects,
  subtopicsBySubject,
}: {
  subjects: SubjectCardData[];
  subtopicsBySubject: Record<string, string[]>;
}) {
  const { startQuiz } = useStartQuiz();
  const [state, setState] = React.useState<WizardState>({
    step: 1,
    subjectId: null,
    subtopics: [],
    difficulty: "mixed",
    size: 10,
    mode: "ordinary",
  });
  const [loading, setLoading] = React.useState(false);

  function patch(updates: Partial<WizardState>) {
    setState((s) => ({ ...s, ...updates }));
  }

  function goNext() {
    if (state.step === 1) {
      // Skip subtopics step when "Any subject" or subject has no subtopics
      const hasSubtopics =
        state.subjectId !== null &&
        (subtopicsBySubject[state.subjectId]?.length ?? 0) > 0;
      patch({ step: hasSubtopics ? 2 : 3, subtopics: [] });
    } else {
      patch({ step: (state.step + 1) as Step });
    }
  }

  function goBack() {
    if (state.step === 3) {
      const hasSubtopics =
        state.subjectId !== null &&
        (subtopicsBySubject[state.subjectId]?.length ?? 0) > 0;
      patch({ step: hasSubtopics ? 2 : 1 });
    } else {
      patch({ step: (state.step - 1) as Step });
    }
  }

  async function handleStart() {
    setLoading(true);
    try {
      await startQuiz({
        filter: {
          subject: state.subjectId ?? undefined,
          tags: state.subtopics.map(slugifyForTag),
          difficulty: state.difficulty,
          size: state.size,
          mode: state.mode,
        },
      });
    } finally {
      setLoading(false);
    }
  }

  const selectedSubject = subjects.find((s) => s.id === state.subjectId);

  return (
    <div className="space-y-8 rounded-xl border bg-card p-6 shadow-sm">
      <StepIndicator step={state.step} />

      {state.step === 1 && (
        <Step1
          subjects={subjects}
          selected={state.subjectId}
          onSelect={(id) => patch({ subjectId: id, subtopics: [] })}
        />
      )}

      {state.step === 2 && state.subjectId && (
        <Step2
          subjectName={selectedSubject?.name ?? state.subjectId}
          subtopics={subtopicsBySubject[state.subjectId] ?? []}
          selected={state.subtopics}
          onChange={(subtopics) => patch({ subtopics })}
        />
      )}

      {state.step === 3 && (
        <Step3
          difficulty={state.difficulty}
          size={state.size}
          mode={state.mode}
          onChange={(p) => patch(p)}
        />
      )}

      <div className="flex justify-between gap-3">
        {state.step > 1 ? (
          <Button variant="outline" onClick={goBack} disabled={loading}>
            <ChevronLeft className="mr-1 size-4" />
            Back
          </Button>
        ) : (
          <div />
        )}

        {state.step < 3 ? (
          <Button onClick={goNext}>
            Next
            <ChevronRight className="ml-1 size-4" />
          </Button>
        ) : (
          <Button onClick={handleStart} disabled={loading}>
            {loading ? "Building…" : "Start Quiz"}
          </Button>
        )}
      </div>
    </div>
  );
}
