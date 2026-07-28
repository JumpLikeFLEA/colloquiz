"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ChevronDown, ChevronUp, Save, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Difficulty, QuizMode } from "@/types";

/**
 * Shared by every select on this page, matching the text inputs beside them.
 * The compact pair inside an expanded question card differ only in height,
 * which comes from the trigger's own size="sm" rather than from here.
 */
const FIELD_TRIGGER = "rounded-lg border-border bg-card text-foreground";

type QuestionType = "multiple_choice" | "true_false";

type DraftQuestion = {
  id: string;
  type: QuestionType;
  question: string;
  options: [string, string, string, string];
  correct_answer: string;
  explanation: string;
  difficulty: Difficulty;
  tags: string;
  expanded: boolean;
};

const SUBJECTS = [
  { id: "mathematics", name: "Mathematics" },
  { id: "physics", name: "Physics" },
  { id: "chemistry", name: "Chemistry" },
  { id: "biology", name: "Biology" },
  { id: "history", name: "History" },
  { id: "geography", name: "Geography" },
  { id: "literature", name: "Literature" },
  { id: "computer_science", name: "Computer Science" },
  { id: "economics", name: "Economics" },
  { id: "psychology", name: "Psychology" },
  { id: "art", name: "Art & Design" },
  { id: "music", name: "Music" },
  { id: "languages", name: "Languages" },
  { id: "philosophy", name: "Philosophy" },
];

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

let draftCounter = 0;
function newDraftId() {
  return `draft_${++draftCounter}`;
}

function blankQuestion(): DraftQuestion {
  return {
    id: newDraftId(),
    type: "multiple_choice",
    question: "",
    options: ["", "", "", ""],
    correct_answer: "",
    explanation: "",
    difficulty: "medium",
    tags: "",
    expanded: true,
  };
}

export default function QuizBuilderPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("computer_science");
  const [mode, setMode] = useState<QuizMode>("ordinary");
  const [difficulty, setDifficulty] = useState<Difficulty | "mixed">("mixed");
  const [questions, setQuestions] = useState<DraftQuestion[]>([blankQuestion()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()
        .then(({ data }) => setIsAdmin(data?.role === "admin"));
    });
  }, []);

  if (isAdmin === null) return null;

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <ShieldAlert className="size-10 text-muted-foreground/50" />
        <h1 className="text-lg font-semibold text-foreground">Admin access required</h1>
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          Ask an admin to set your role to <code className="bg-muted px-1 rounded text-xs">admin</code> in the Supabase dashboard.
        </p>
        <button
          onClick={() => router.push("/")}
          className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Go Home
        </button>
      </div>
    );
  }

  function updateQuestion(id: string, patch: Partial<DraftQuestion>) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  function removeQuestion(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, blankQuestion()]);
  }

  function toggleExpanded(id: string) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, expanded: !q.expanded } : q))
    );
  }

  function setOption(qId: string, idx: number, val: string) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const opts = [...q.options] as [string, string, string, string];
        opts[idx] = val;
        return { ...q, options: opts };
      })
    );
  }

  async function handleSave() {
    setError(null);
    setSaved(false);

    if (!title.trim()) { setError("Quiz title is required."); return; }
    if (questions.length === 0) { setError("Add at least one question."); return; }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.trim()) { setError(`Question ${i + 1}: text is required.`); return; }
      if (!q.correct_answer.trim()) { setError(`Question ${i + 1}: correct answer is required.`); return; }
      if (q.type === "multiple_choice") {
        const filled = q.options.filter((o) => o.trim()).length;
        if (filled < 2) { setError(`Question ${i + 1}: at least 2 options are required.`); return; }
      }
    }

    const payload = {
      title: title.trim(),
      subject,
      mode,
      difficulty,
      questions: questions.map((q) => ({
        type: q.type,
        question: q.question.trim(),
        options:
          q.type === "true_false"
            ? (["True", "False", "", ""] as [string, string, string, string])
            : q.options,
        correct_answer: q.correct_answer.trim(),
        explanation: q.explanation.trim(),
        difficulty: q.difficulty,
        tags: q.tags
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
      })),
    };

    setSaving(true);
    try {
      const res = await fetch("/api/admin/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Save failed.");
        return;
      }
      setSaved(true);
      setTitle("");
      setQuestions([blankQuestion()]);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-10 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Quiz Builder</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Admin · create a new quiz with custom questions</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Save className="size-4" />
          {saving ? "Saving…" : "Save Quiz"}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-destructive-subtle border border-destructive-border text-sm text-destructive-text">
          {error}
        </div>
      )}
      {saved && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-success-subtle border border-success-border text-sm text-success">
          Quiz saved! Questions are now available in the question pool.
        </div>
      )}

      {/* Quiz metadata */}
      <div className="rounded-2xl border border-border bg-card p-5 mb-5 shadow-xs">
        <h2 className="text-sm font-semibold text-foreground mb-4">Quiz Details</h2>
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Advanced Calculus Exam"
              className="w-full px-3 py-2 rounded-lg border border-border text-sm outline-none focus:border-ring transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Subject</label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger className={FIELD_TRIGGER}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Mode</label>
              <Select value={mode} onValueChange={(v) => setMode(v as QuizMode)}>
                <SelectTrigger className={FIELD_TRIGGER}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ordinary">Ordinary</SelectItem>
                  <SelectItem value="exam">Exam</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Difficulty</label>
              <Select
                value={difficulty}
                onValueChange={(v) => setDifficulty(v as Difficulty | "mixed")}
              >
                <SelectTrigger className={FIELD_TRIGGER}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mixed">Mixed</SelectItem>
                  {DIFFICULTIES.map((d) => (
                    <SelectItem key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="flex flex-col gap-3 mb-4">
        {questions.map((q, idx) => (
          <QuestionCard
            key={q.id}
            q={q}
            idx={idx}
            onToggle={() => toggleExpanded(q.id)}
            onRemove={() => removeQuestion(q.id)}
            onUpdate={(patch) => updateQuestion(q.id, patch)}
            onOptionChange={(i, val) => setOption(q.id, i, val)}
          />
        ))}
      </div>

      <button
        onClick={addQuestion}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:border-ring hover:text-foreground transition-colors"
      >
        <Plus className="size-4" />
        Add Question
      </button>
    </div>
  );
}

type CardProps = {
  q: DraftQuestion;
  idx: number;
  onToggle: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<DraftQuestion>) => void;
  onOptionChange: (i: number, val: string) => void;
};

function QuestionCard({ q, idx, onToggle, onRemove, onUpdate, onOptionChange }: CardProps) {
  const isTF = q.type === "true_false";
  const displayOptions: [string, string, string, string] = isTF
    ? ["True", "False", "", ""]
    : q.options;

  return (
    <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-accent transition-colors"
        onClick={onToggle}
      >
        <span className="size-6 rounded-full bg-muted text-muted-foreground text-xs font-semibold flex items-center justify-center flex-shrink-0">
          {idx + 1}
        </span>
        <span className="flex-1 text-sm text-foreground truncate">
          {q.question.trim() || <span className="text-muted-foreground/50 italic">Untitled question</span>}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize hidden sm:block">
          {q.difficulty}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="text-muted-foreground/50 hover:text-destructive-text transition-colors"
          aria-label="Remove question"
        >
          <Trash2 className="size-4" />
        </button>
        {q.expanded ? (
          <ChevronUp className="size-4 text-muted-foreground/50" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground/50" />
        )}
      </div>

      {/* Expanded editor */}
      {q.expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 flex flex-col gap-3">
          {/* Type + difficulty row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
              <Select
                value={q.type}
                onValueChange={(v) => {
                  const t = v as QuestionType;
                  onUpdate({
                    type: t,
                    options: t === "true_false" ? ["True", "False", "", ""] : ["", "", "", ""],
                    correct_answer: "",
                  });
                }}
              >
                <SelectTrigger size="sm" className={FIELD_TRIGGER}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                  <SelectItem value="true_false">True / False</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Difficulty</label>
              <Select
                value={q.difficulty}
                onValueChange={(v) => onUpdate({ difficulty: v as Difficulty })}
              >
                <SelectTrigger size="sm" className={FIELD_TRIGGER}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTIES.map((d) => (
                    <SelectItem key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Question text */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Question</label>
            <textarea
              value={q.question}
              onChange={(e) => onUpdate({ question: e.target.value })}
              placeholder="Enter the question…"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm outline-none focus:border-ring resize-none transition-colors"
            />
          </div>

          {/* Options */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Options {!isTF && <span className="font-normal text-muted-foreground">(mark correct with the radio)</span>}
            </label>
            <div className="flex flex-col gap-1.5">
              {(isTF ? [0, 1] : [0, 1, 2, 3]).map((i) => (
                <label key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct_${q.id}`}
                    checked={q.correct_answer === displayOptions[i]}
                    onChange={() => onUpdate({ correct_answer: displayOptions[i] })}
                    className="flex-shrink-0"
                  />
                  {isTF ? (
                    <span className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-muted text-sm text-muted-foreground">
                      {displayOptions[i]}
                    </span>
                  ) : (
                    <input
                      type="text"
                      value={q.options[i]}
                      onChange={(e) => onOptionChange(i, e.target.value)}
                      placeholder={`Option ${String.fromCharCode(65 + i)}`}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-border text-sm outline-none focus:border-ring transition-colors"
                    />
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Explanation */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Explanation <span className="font-normal text-muted-foreground">(optional)</span></label>
            <textarea
              value={q.explanation}
              onChange={(e) => onUpdate({ explanation: e.target.value })}
              placeholder="Why is this the correct answer?"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm outline-none focus:border-ring resize-none transition-colors"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Tags <span className="font-normal text-muted-foreground">(comma-separated subtopics)</span></label>
            <input
              type="text"
              value={q.tags}
              onChange={(e) => onUpdate({ tags: e.target.value })}
              placeholder="e.g. algebra, calculus"
              className="w-full px-3 py-1.5 rounded-lg border border-border text-sm outline-none focus:border-ring transition-colors"
            />
          </div>
        </div>
      )}
    </div>
  );
}
