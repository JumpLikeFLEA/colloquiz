"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Check, RefreshCw, Users, ChevronRight, Trash2, Link2 } from "lucide-react";
import type { LinkedStudent, TutorAssignment } from "@/lib/author";

export function StudentsView({
  students,
  assignments,
}: {
  students: LinkedStudent[];
  assignments: TutorAssignment[];
}) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/invites")
      .then((r) => r.json())
      .then((d) => setToken(d.token ?? null))
      .catch(() => setToken(null));
  }, []);

  const inviteUrl =
    token && typeof window !== "undefined" ? `${window.location.origin}/invite/${token}` : "";

  async function copy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function rotate() {
    setRotating(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotate: true }),
      });
      const data = await res.json();
      if (res.ok) setToken(data.token);
    } finally {
      setRotating(false);
    }
  }

  async function unlink(studentId: string) {
    const res = await fetch(`/api/students/${studentId}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  const byStudent = new Map<string, TutorAssignment[]>();
  for (const a of assignments) {
    const list = byStudent.get(a.studentId) ?? [];
    list.push(a);
    byStudent.set(a.studentId, list);
  }

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Students</h1>
        <p className="text-muted-foreground mt-1">
          Share your invite link, then assign quizzes and review their answers.
        </p>
      </div>

      {/* Invite link */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="size-4 text-[#4f46e5]" />
          <h2 className="text-sm font-semibold text-foreground">Your invite link</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Send this link to a student. When they open it while signed in, they&rsquo;ll be linked to you.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            readOnly
            value={inviteUrl}
            placeholder="Generating…"
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={copy}
              disabled={!inviteUrl}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#4f46e5] text-white text-sm font-medium hover:bg-[#4338ca] disabled:opacity-50 transition-colors"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={rotate}
              disabled={rotating}
              title="Generate a new link and disable the old one"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`size-4 ${rotating ? "animate-spin" : ""}`} />
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Roster */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">
          Linked students ({students.length})
        </h2>
        {students.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground rounded-2xl border border-dashed border-border">
            <Users size={32} className="mb-2 opacity-40" />
            <p className="text-sm">No students yet. Share your invite link to get started.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {students.map((s) => {
              const list = byStudent.get(s.id) ?? [];
              const isOpen = expanded === s.id;
              return (
                <div key={s.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="flex items-center gap-3 p-4">
                    <button
                      onClick={() => setExpanded(isOpen ? null : s.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] flex items-center justify-center text-white text-sm font-medium shrink-0">
                        {s.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.assignedCount} assigned · {s.completedCount} completed
                        </p>
                      </div>
                      <ChevronRight
                        size={16}
                        className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                      />
                    </button>
                    <button
                      onClick={() => unlink(s.id)}
                      aria-label="Unlink student"
                      className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {isOpen && (
                    <div className="border-t border-border px-4 py-3">
                      {list.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">No quizzes assigned yet.</p>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {list.map((a) => (
                            <div key={a.id} className="flex items-center gap-3 py-1.5">
                              <span className="flex-1 text-sm text-foreground truncate">{a.quizTitle}</span>
                              {a.status === "completed" ? (
                                <>
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                                    Completed
                                  </span>
                                  <Link
                                    href={`/students/review/${a.id}`}
                                    className="text-xs font-medium text-[#4f46e5] hover:underline"
                                  >
                                    Review
                                  </Link>
                                </>
                              ) : (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                                  Assigned
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
