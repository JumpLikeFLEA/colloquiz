"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Play, Users, Pencil, Trash2, ClipboardList, BookOpen, Clock, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Checkbox } from "@/app/components/ui/checkbox";
import { BecomeAuthorCard } from "@/app/components/BecomeAuthorCard";
import { useStartQuiz } from "@/app/components/StartQuizProvider";
import type { CreatedQuiz, MyAssignment, LinkedStudent } from "@/lib/author";
import type { ActiveSessionSummary } from "@/lib/quizSession";

export function MyQuizzesView({
  isAuthor,
  assignments,
  created,
  students,
  active,
}: {
  isAuthor: boolean;
  assignments: MyAssignment[];
  created: CreatedQuiz[];
  students: LinkedStudent[];
  active: ActiveSessionSummary | null;
}) {
  const router = useRouter();
  const { startQuiz } = useStartQuiz();
  const [assignFor, setAssignFor] = useState<CreatedQuiz | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exitActive(quizId: string) {
    await fetch("/api/quiz/session", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quizId }),
    });
    router.refresh();
  }

  async function deleteQuiz(id: string) {
    setError(null);
    const res = await fetch(`/api/author/quiz/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not delete quiz.");
      setConfirmDelete(null);
      return;
    }
    setConfirmDelete(null);
    router.refresh();
  }

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Quizzes</h1>
        <p className="text-muted-foreground mt-1">Quizzes assigned to you and quizzes you&rsquo;ve created.</p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* In progress (active session) */}
      {active && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="size-4 text-[#4f46e5]" />
            <h2 className="text-sm font-semibold text-foreground">In progress</h2>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-2xl border border-[#4f46e5]/30 bg-[#eef2ff]">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{active.title}</p>
              <p className="text-xs text-muted-foreground">Active quiz &middot; not finished</p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#4f46e5]/10 text-[#4f46e5] border border-[#4f46e5]/20">
              Active
            </span>
            <Link
              href={`/quiz/${active.quizId}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4f46e5] text-white text-sm font-medium hover:bg-[#4338ca] transition-colors"
            >
              <Play className="size-3.5" /> Resume
            </Link>
            <button
              onClick={() => exitActive(active.quizId)}
              title="Exit quiz"
              className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </section>
      )}

      {/* Assigned to me */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="size-4 text-[#4f46e5]" />
          <h2 className="text-sm font-semibold text-foreground">Assigned to me</h2>
        </div>
        {assignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border">
            <BookOpen size={30} className="mb-2 opacity-40" />
            <p className="text-sm">Nothing assigned to you yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{a.quizTitle}</p>
                  <p className="text-xs text-muted-foreground">from {a.tutorName}</p>
                </div>
                {a.status === "completed" ? (
                  <>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                      Completed
                    </span>
                    {a.resultId ? (
                      <Link
                        href={`/results/${a.resultId}`}
                        className="text-sm font-medium text-[#4f46e5] hover:underline"
                      >
                        View result
                      </Link>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                      Assigned
                    </span>
                    <button
                      onClick={() => startQuiz({ quizId: a.quizId })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4f46e5] text-white text-sm font-medium hover:bg-[#4338ca] transition-colors cursor-pointer"
                    >
                      <Play className="size-3.5" /> Start
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Created by me */}
      {isAuthor ? (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Pencil className="size-4 text-[#4f46e5]" />
              <h2 className="text-sm font-semibold text-foreground">Created by me</h2>
            </div>
            <Link
              href="/my-quizzes/builder"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4f46e5] text-white text-sm font-medium hover:bg-[#4338ca] transition-colors"
            >
              <Plus className="size-4" /> New Quiz
            </Link>
          </div>
          {created.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border">
              <p className="text-sm">You haven&rsquo;t created any quizzes yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {created.map((q) => (
                <div key={q.id} className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{q.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {q.questionCount} question{q.questionCount !== 1 ? "s" : ""}
                      {q.assignedCount > 0 && ` · ${q.assignedCount} assigned · ${q.completedCount} completed`}
                    </p>
                  </div>
                  <button
                    onClick={() => startQuiz({ quizId: q.id })}
                    title="Preview"
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                  >
                    <Play className="size-4" />
                  </button>
                  <button
                    onClick={() => setAssignFor(q)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
                  >
                    <Users className="size-3.5" /> Assign
                  </button>
                  <Link
                    href={`/my-quizzes/builder?id=${q.id}`}
                    title="Edit"
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <Pencil className="size-4" />
                  </Link>
                  {confirmDelete === q.id ? (
                    <button
                      onClick={() => deleteQuiz(q.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors"
                    >
                      Confirm
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(q.id)}
                      title="Delete"
                      className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <BecomeAuthorCard />
      )}

      {assignFor && (
        <AssignDialog
          quiz={assignFor}
          students={students}
          onClose={() => setAssignFor(null)}
          onDone={() => {
            setAssignFor(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function AssignDialog({
  quiz,
  students,
  onClose,
  onDone,
}: {
  quiz: CreatedQuiz;
  students: LinkedStudent[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function assign() {
    if (selected.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId: quiz.id, studentIds: [...selected] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not assign quiz.");
        return;
      }
      onDone();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign &ldquo;{quiz.title}&rdquo;</DialogTitle>
          <DialogDescription>Choose the students who should receive this quiz.</DialogDescription>
        </DialogHeader>

        {students.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            You have no linked students yet.{" "}
            <Link href="/students" className="text-[#4f46e5] font-medium hover:underline" onClick={onClose}>
              Invite a student
            </Link>
            .
          </div>
        ) : (
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {students.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent cursor-pointer"
              >
                <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} />
                <span className="text-sm text-foreground">{s.name}</span>
              </label>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={assign}
            disabled={saving || selected.size === 0}
            className="px-4 py-2 rounded-lg bg-[#4f46e5] text-white text-sm font-medium hover:bg-[#4338ca] disabled:opacity-50 transition-colors"
          >
            {saving ? "Assigning…" : `Assign${selected.size ? ` (${selected.size})` : ""}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
