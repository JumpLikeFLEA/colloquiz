"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Save,
  Download,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { answerOptions } from "@/lib/options";
import type { Difficulty, Question, Quiz } from "@/types";

type QuestionType = "multiple_choice" | "true_false";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

// The editable shape of one question. `savedId` is the DB id — the whole point
// of this builder is that it never changes across an edit, so review status
// survives and the ids recorded in past results stay resolvable.
type Draft = {
  savedId: string | null;
  type: QuestionType;
  question: string;
  options: [string, string, string, string];
  correct_answer: string;
  explanation: string;
  difficulty: Difficulty;
  tags: string;
  status: Question["status"];
  createdBy: string | null;
};

function toDraft(q: Question): Draft {
  return {
    savedId: q.id,
    type:
      q.options[0] === "True" && q.options[1] === "False" ? "true_false" : "multiple_choice",
    question: q.question,
    options: q.options,
    correct_answer: q.correct_answer,
    explanation: q.explanation,
    difficulty: q.difficulty,
    tags: (q.tags ?? []).join(", "),
    status: q.status,
    createdBy: q.created_by ?? null,
  };
}

function blankDraft(): Draft {
  return {
    savedId: null,
    type: "multiple_choice",
    question: "",
    options: ["", "", "", ""],
    correct_answer: "",
    explanation: "",
    difficulty: "medium",
    tags: "",
    status: "pending",
    createdBy: null,
  };
}

function validate(d: Draft): string | null {
  if (!d.question.trim()) return "Question text is required.";
  if (!d.correct_answer.trim()) return "Mark which option is correct.";
  if (d.type === "multiple_choice" && d.options.some((o) => !o.trim())) {
    return "All 4 options are required.";
  }
  return null;
}

function toPayload(d: Draft) {
  return {
    type: d.type,
    question: d.question.trim(),
    options:
      d.type === "true_false"
        ? (["True", "False", "", ""] as [string, string, string, string])
        : d.options,
    correct_answer: d.correct_answer.trim(),
    explanation: d.explanation.trim(),
    difficulty: d.difficulty,
    tags: d.tags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  };
}

export function GroupBuilderView({
  groupId,
  groupName,
  quiz,
  initialQuestions,
  subjects,
  userId,
}: {
  groupId: string;
  groupName: string;
  quiz: Quiz;
  initialQuestions: Question[];
  subjects: { id: string; name: string }[];
  userId: string;
}) {
  const router = useRouter();

  const [title, setTitle] = useState(quiz.title);
  const [subject, setSubject] = useState(
    initialQuestions[0]?.subject ?? subjects[0]?.id ?? "computer_science",
  );
  // Derived from props, not held in state: every mutation calls
  // router.refresh(), which re-renders this component with fresh server data.
  // A useState initializer would only run once and the list would go stale
  // the moment another member's question landed.
  const saved: Draft[] = initialQuestions.map(toDraft);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Each question is written on its own, so a save touches exactly one row.
  // Two members editing different questions never collide, and nothing is
  // deleted-and-recreated on the way through.
  async function saveOne(d: Draft) {
    const invalid = validate(d);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/questions/${d.savedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, quizId: quiz.id, question: toPayload(d) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not save the question.");
        return;
      }
      setExpanded(null);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function addOne(d: Draft) {
    const invalid = validate(d);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId: quiz.id, subject, question: toPayload(d) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not add the question.");
        return;
      }
      setAdding(null);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeOne(questionId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/questions/${questionId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId: quiz.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not remove the question.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, delta: number) {
    const ids = saved.map((d) => d.savedId).filter(Boolean) as string[];
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/quizzes/${quiz.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionIds: ids }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not reorder.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveTitle() {
    if (!title.trim() || title === quiz.title) return;
    setBusy(true);
    try {
      await fetch(`/api/groups/${groupId}/quizzes/${quiz.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-6">
      <div>
        <Link
          href={`/groups/${groupId}`}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← {groupName}
        </Link>
        <h1 className="text-2xl font-bold text-foreground mt-1">Edit quiz</h1>
        <p className="text-muted-foreground mt-1">
          Every question is saved on its own and goes to the group&rsquo;s review queue.
        </p>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Quiz details */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Quiz details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Subject
            </label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="flex flex-col gap-3">
        {saved.map((d, idx) => (
          <QuestionCard
            key={d.savedId ?? idx}
            draft={d}
            index={idx}
            total={saved.length}
            isMine={d.createdBy === userId}
            expanded={expanded === d.savedId}
            busy={busy}
            onToggle={() => setExpanded(expanded === d.savedId ? null : d.savedId)}
            onSave={(next) => saveOne(next)}
            onRemove={() => d.savedId && removeOne(d.savedId)}
            onMove={(delta) => move(idx, delta)}
          />
        ))}
      </div>

      {adding ? (
        <QuestionEditor
          draft={adding}
          onChange={setAdding}
          onCancel={() => setAdding(null)}
          onSubmit={() => addOne(adding)}
          submitLabel="Add question"
          busy={busy}
        />
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => setAdding(blankDraft())}
            className="cursor-pointer flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:border-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="size-4" />
            Add question
          </button>
          <ImportButton groupId={groupId} quizId={quiz.id} userId={userId} />
        </div>
      )}
    </div>
  );
}

// ── One saved question ──────────────────────────────────────

const STATUS_STYLE: Record<Question["status"], string> = {
  pending: "bg-amber-50 text-amber-600 border-amber-200",
  approved: "bg-emerald-50 text-emerald-600 border-emerald-200",
  rejected: "bg-red-50 text-red-600 border-red-200",
};

function QuestionCard({
  draft,
  index,
  total,
  isMine,
  expanded,
  busy,
  onToggle,
  onSave,
  onRemove,
  onMove,
}: {
  draft: Draft;
  index: number;
  total: number;
  isMine: boolean;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onSave: (d: Draft) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  // Edit buffer, so typing doesn't fire a request per keystroke. Reloaded from
  // the server copy each time the editor is opened — another member may have
  // changed this question since the page was rendered. Deliberately keyed on
  // `expanded` alone: depending on `draft` would clobber the buffer on every
  // re-render, since the parent maps a fresh object each time.
  const [local, setLocal] = useState(draft);
  // Adjusted during render rather than in an effect (the pattern React
  // documents for "reset state when a prop changes"), so the reload happens on
  // the same pass that opens the editor instead of a second cascading render.
  const [wasExpanded, setWasExpanded] = useState(expanded);
  if (expanded !== wasExpanded) {
    setWasExpanded(expanded);
    if (expanded) setLocal(draft);
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="size-6 rounded-full bg-muted text-muted-foreground text-xs font-semibold flex items-center justify-center shrink-0">
          {index + 1}
        </span>
        <button onClick={onToggle} className="flex-1 min-w-0 text-left cursor-pointer">
          <span className="text-sm text-foreground truncate block">
            {draft.question.trim() || (
              <span className="text-muted-foreground italic">Untitled question</span>
            )}
          </span>
        </button>
        <span
          className={`text-xs px-2 py-0.5 rounded-full border capitalize hidden sm:block ${STATUS_STYLE[draft.status]}`}
        >
          {draft.status}
        </span>
        {!isMine && (
          <span className="text-xs text-muted-foreground hidden sm:block">by a member</span>
        )}
        <button
          onClick={() => onMove(-1)}
          disabled={index === 0 || busy}
          aria-label="Move up"
          className="cursor-pointer disabled:cursor-not-allowed p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
        >
          <ArrowUp className="size-3.5" />
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={index === total - 1 || busy}
          aria-label="Move down"
          className="cursor-pointer disabled:cursor-not-allowed p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
        >
          <ArrowDown className="size-3.5" />
        </button>
        <button
          onClick={onRemove}
          disabled={busy}
          aria-label="Remove question"
          className="cursor-pointer p-1 rounded text-muted-foreground hover:text-red-500 transition-colors"
        >
          <Trash2 className="size-4" />
        </button>
        <button onClick={onToggle} aria-label="Toggle editor" className="cursor-pointer text-muted-foreground">
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <Fields draft={local} onChange={setLocal} />
          <p className="text-xs text-muted-foreground mt-3">
            Saving an edit sends the question back to the review queue — the previous approval
            applied to the old wording.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => onSave(local)}
              disabled={busy}
              className="cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#4f46e5] text-white text-sm font-medium hover:bg-[#4338ca] disabled:opacity-50 transition-colors"
            >
              <Save className="size-4" />
              Save changes
            </button>
            <button
              onClick={onToggle}
              className="cursor-pointer px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── The new-question editor ─────────────────────────────────

function QuestionEditor({
  draft,
  onChange,
  onCancel,
  onSubmit,
  submitLabel,
  busy,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  busy: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Fields draft={draft} onChange={onChange} />
      <div className="flex gap-2 mt-3">
        <button
          onClick={onSubmit}
          disabled={busy}
          className="cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#4f46e5] text-white text-sm font-medium hover:bg-[#4338ca] disabled:opacity-50 transition-colors"
        >
          <Save className="size-4" />
          {submitLabel}
        </button>
        <button
          onClick={onCancel}
          className="cursor-pointer px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Shared field set, so the add and edit paths can't drift apart.
function Fields({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const isTF = draft.type === "true_false";
  const displayOptions: [string, string, string, string] = isTF
    ? ["True", "False", "", ""]
    : draft.options;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
          <select
            value={draft.type}
            onChange={(e) => {
              const t = e.target.value as QuestionType;
              onChange({
                ...draft,
                type: t,
                options: t === "true_false" ? ["True", "False", "", ""] : ["", "", "", ""],
                correct_answer: "",
              });
            }}
            className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
          >
            <option value="multiple_choice">Multiple Choice</option>
            <option value="true_false">True / False</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Difficulty
          </label>
          <select
            value={draft.difficulty}
            onChange={(e) => onChange({ ...draft, difficulty: e.target.value as Difficulty })}
            className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground outline-none capitalize"
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Question</label>
        <textarea
          value={draft.question}
          onChange={(e) => onChange({ ...draft, question: e.target.value })}
          placeholder="Enter the question…"
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none resize-none"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Options{" "}
          {!isTF && <span className="font-normal">(mark correct with the radio)</span>}
        </label>
        <div className="flex flex-col gap-1.5">
          {(isTF ? [0, 1] : [0, 1, 2, 3]).map((i) => (
            <label key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`correct_${draft.savedId ?? "new"}`}
                checked={!!displayOptions[i] && draft.correct_answer === displayOptions[i]}
                onChange={() => onChange({ ...draft, correct_answer: displayOptions[i] })}
                className="shrink-0"
              />
              {isTF ? (
                <span className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-muted text-sm text-muted-foreground">
                  {displayOptions[i]}
                </span>
              ) : (
                <input
                  value={draft.options[i]}
                  onChange={(e) => {
                    const opts = [...draft.options] as [string, string, string, string];
                    const prev = opts[i];
                    opts[i] = e.target.value;
                    onChange({
                      ...draft,
                      options: opts,
                      // Keep the correct answer pointing at this option while
                      // it's being retyped, instead of silently unsetting it.
                      correct_answer:
                        draft.correct_answer === prev && prev !== ""
                          ? e.target.value
                          : draft.correct_answer,
                    });
                  }}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
                />
              )}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Explanation <span className="font-normal">(optional)</span>
        </label>
        <textarea
          value={draft.explanation}
          onChange={(e) => onChange({ ...draft, explanation: e.target.value })}
          placeholder="Why is this the correct answer?"
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none resize-none"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Tags <span className="font-normal">(comma-separated subtopics)</span>
        </label>
        <input
          value={draft.tags}
          onChange={(e) => onChange({ ...draft, tags: e.target.value })}
          placeholder="e.g. algebra, calculus"
          className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
        />
      </div>
    </div>
  );
}

// ── Import from the pool or your own private questions ──────

function ImportButton({
  groupId,
  quizId,
  userId,
}: {
  groupId: string;
  quizId: string;
  userId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Question[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read directly with the browser client: RLS already limits this to the
  // approved public pool plus the caller's own rows, and the import route
  // re-checks eligibility server-side before copying anything.
  async function search() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      let q = supabase
        .from("questions")
        .select("*")
        .or(`and(visibility.eq.shared,status.eq.approved),and(visibility.eq.private,created_by.eq.${userId})`)
        .limit(25);
      if (query.trim()) q = q.ilike("question", `%${query.trim()}%`);
      const { data, error: err } = await q;
      if (err) throw new Error(err.message);
      setResults((data ?? []) as Question[]);
    } catch {
      setError("Could not load questions.");
    } finally {
      setLoading(false);
    }
  }

  async function importPicked() {
    if (picked.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/questions/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId, questionIds: picked }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not import.");
        return;
      }
      setOpen(false);
      setPicked([]);
      setResults([]);
      setQuery("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          void search();
        }}
        className="cursor-pointer flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:border-muted-foreground hover:text-foreground transition-colors"
      >
        <Download className="size-4" />
        Import
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import questions</DialogTitle>
            <DialogDescription>
              From the public pool or your own private questions. A copy is added to this quiz —
              the original is left untouched.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="Search questions…"
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
            />
            <button
              onClick={search}
              disabled={loading}
              className="cursor-pointer disabled:cursor-not-allowed px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent disabled:opacity-50 transition-colors"
            >
              Search
            </button>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="max-h-72 overflow-y-auto flex flex-col gap-1.5">
            {results.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No questions found.
              </p>
            ) : (
              results.map((q) => {
                const on = picked.includes(q.id);
                return (
                  <button
                    key={q.id}
                    onClick={() =>
                      setPicked(on ? picked.filter((id) => id !== q.id) : [...picked, q.id])
                    }
                    className={`cursor-pointer flex items-start gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
                      on
                        ? "bg-[#eef2ff] border-[#c7d2fe]"
                        : "bg-background border-border hover:bg-accent"
                    }`}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="text-sm text-foreground block">{q.question}</span>
                      <span className="text-xs text-muted-foreground">
                        {q.visibility === "private" ? "your question" : "public pool"} ·{" "}
                        {answerOptions(q.options).length} options · {q.difficulty}
                      </span>
                    </span>
                    {on && <X className="size-4 text-[#4f46e5] shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          <DialogFooter>
            <button
              onClick={() => setOpen(false)}
              className="cursor-pointer px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={importPicked}
              disabled={picked.length === 0 || loading}
              className="cursor-pointer disabled:cursor-not-allowed px-3 py-2 rounded-lg bg-[#4f46e5] text-white text-sm font-medium hover:bg-[#4338ca] disabled:opacity-50 transition-colors"
            >
              Import {picked.length > 0 ? `(${picked.length})` : ""}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
