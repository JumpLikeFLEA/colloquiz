"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Link2,
  Plus,
  Play,
  Pencil,
  ClipboardList,
  LogOut,
  BookOpen,
  Medal,
  Swords,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { useStartQuiz } from "@/app/components/StartQuizProvider";
import type { GroupDetail } from "@/lib/groups";
import type { LeaderboardRow } from "@/lib/leaderboard";
import { pluralize } from "@/lib/format";

export function GroupDetailView({
  detail,
  userId,
  standings,
  subjects,
}: {
  detail: GroupDetail;
  userId: string;
  standings: LeaderboardRow[];
  /** Subjects that actually have pool questions — the duel dialog's options. */
  subjects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { startQuiz } = useStartQuiz();
  const { group, role, members, quizzes, pendingCount } = detail;
  const isOwner = role === "owner";

  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);
  const [confirmDeleteQuiz, setConfirmDeleteQuiz] = useState<string | null>(null);
  // Covers both branches of the roster button — leaving and being kicked are
  // the same DELETE, and both are a one-click misclick away from losing access.
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [creatingQuiz, setCreatingQuiz] = useState(false);
  const [quizTitle, setQuizTitle] = useState("");
  const [challenging, setChallenging] = useState<{ id: string; name: string } | null>(null);
  // "any" rather than "" because a Select item cannot carry an empty value —
  // that is reserved for "nothing selected". Mapped back to null on submit.
  const [duelSubject, setDuelSubject] = useState("any");
  const [duelDifficulty, setDuelDifficulty] = useState<"mixed" | "easy" | "medium" | "hard">("mixed");
  const [duelSize, setDuelSize] = useState(10);
  const [sendingDuel, setSendingDuel] = useState(false);
  const [duelError, setDuelError] = useState<string | null>(null);

  async function sendChallenge() {
    if (!challenging) return;
    setSendingDuel(true);
    setDuelError(null);
    try {
      const res = await fetch("/api/duels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opponentId: challenging.id,
          groupId: group.id,
          subject: duelSubject === "any" ? null : duelSubject,
          difficulty: duelDifficulty,
          size: duelSize,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDuelError(data.error ?? "Could not send the challenge.");
        return;
      }
      setChallenging(null);
      // The challenge is not playable until they accept, so send the challenger
      // to their duel list rather than straight into the quiz.
      router.push("/duels");
    } finally {
      setSendingDuel(false);
    }
  }

  useEffect(() => {
    if (!isOwner) return;
    fetch(`/api/groups/${group.id}/invite`)
      .then((r) => r.json())
      .then((d) => setToken(d.token ?? null))
      .catch(() => setToken(null));
  }, [group.id, isOwner]);

  const inviteUrl =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/groups/join/${token}`
      : "";

  async function copy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function rotate() {
    setRotating(true);
    try {
      const res = await fetch(`/api/groups/${group.id}/invite`, {
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

  async function removeMember(uid: string) {
    setError(null);
    const res = await fetch(`/api/groups/${group.id}/members/${uid}`, { method: "DELETE" });
    setConfirmRemove(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not remove that member.");
      return;
    }
    if (uid === userId) router.push("/groups");
    router.refresh();
  }

  async function deleteGroup() {
    setError(null);
    const res = await fetch(`/api/groups/${group.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not delete the group.");
      setConfirmDeleteGroup(false);
      return;
    }
    router.push("/groups");
  }

  async function deleteQuiz(quizId: string) {
    setError(null);
    const res = await fetch(`/api/groups/${group.id}/quizzes/${quizId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not delete the quiz.");
    }
    setConfirmDeleteQuiz(null);
    router.refresh();
  }

  async function createQuiz() {
    if (!quizTitle.trim()) return;
    setError(null);
    const res = await fetch(`/api/groups/${group.id}/quizzes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: quizTitle }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Could not create the quiz.");
      return;
    }
    setCreatingQuiz(false);
    setQuizTitle("");
    router.push(`/groups/${group.id}/builder?quiz=${data.quizId}`);
  }

  // Built as one string rather than as JSX text. A JSX text node that follows
  // an expression AND wraps onto a second source line loses its leading space
  // under SWC, which is what rendered "all 0 quizzesthe group created". Keeping
  // the whole sentence inside a single expression sidesteps JSX whitespace
  // entirely, and lets the empty case read properly instead of "all 0 quizzes".
  const deleteWarning =
    quizzes.length === 0
      ? "This removes every member and the group’s invite link. This can’t be undone."
      : quizzes.length === 1
        ? "This removes every member, the one quiz the group created, its questions, and every recorded attempt of it. This can’t be undone."
        : `This removes every member, all ${quizzes.length} quizzes the group created, their questions, and every recorded attempt of them. This can’t be undone.`;

  // One dialog for both branches of the roster button. Plain strings for the
  // same JSX-whitespace reason as deleteWarning above.
  const leavingSelf = confirmRemove?.id === userId;
  const removeTitle = leavingSelf
    ? `Leave “${group.name}”?`
    : `Remove ${confirmRemove?.name ?? "this member"}?`;
  const removeWarning = leavingSelf
    ? "You’ll lose access to the group’s quizzes and its review queue. Questions you wrote stay with the group, and you’ll need the invite link again to come back."
    : "They lose access to the group’s quizzes and its review queue. Questions they wrote stay with the group, and they’ll need the invite link again to rejoin.";

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/groups"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← All groups
          </Link>
          <h1 className="text-2xl font-bold text-foreground mt-1 truncate">{group.name}</h1>
          {group.description && (
            <p className="text-muted-foreground mt-1">{group.description}</p>
          )}
        </div>
        {isOwner && (
          <button
            onClick={() => setConfirmDeleteGroup(true)}
            className="cursor-pointer p-2 rounded-lg text-muted-foreground hover:text-destructive-text hover:bg-destructive-subtle transition-colors shrink-0"
            aria-label="Delete group"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-border text-sm text-destructive-text">
          {error}
        </div>
      )}

      {/* Invite link — owner only, since only they may rotate it */}
      {isOwner && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="size-4 text-brand-text" />
            <h2 className="text-sm font-semibold text-foreground">Invite link</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Send this to anyone you want in the group. Opening it while signed in joins them.
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
                className="cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={rotate}
                disabled={rotating}
                title="Generate a new link and disable the old one"
                className="cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`size-4 ${rotating ? "animate-spin" : ""}`} />
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review queue */}
      {pendingCount > 0 && (
        <Link
          href={`/groups/${group.id}/review`}
          className="flex items-center gap-3 p-4 rounded-2xl border border-warning-border bg-warning-subtle hover:bg-warning-subtle transition-colors"
        >
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-warning-subtle text-warning shrink-0">
            <ClipboardList size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-warning">
              {pendingCount} {pendingCount === 1 ? "question" : "questions"} awaiting review
            </p>
            <p className="text-xs text-warning mt-0.5">
              Approved questions become playable. You can&rsquo;t review your own.
            </p>
          </div>
        </Link>
      )}

      {/* Quizzes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Quizzes ({quizzes.length})</h2>
          <button
            onClick={() => setCreatingQuiz(true)}
            className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
          >
            <Plus className="size-4" />
            New quiz
          </button>
        </div>
        {quizzes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground rounded-2xl border border-dashed border-border">
            <BookOpen size={32} className="mb-2 opacity-40" />
            <p className="text-sm">No quizzes yet. Create one and start adding questions.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {quizzes.map((q) => (
              <div
                key={q.id}
                className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{q.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {q.questionCount} {q.questionCount === 1 ? "question" : "questions"}
                    {q.approvedCount < q.questionCount && (
                      <> &middot; {q.approvedCount} approved</>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => startQuiz({ quizId: q.id })}
                  disabled={q.approvedCount === 0}
                  title={
                    q.approvedCount === 0
                      ? "No approved questions yet — review them first"
                      : "Play this quiz"
                  }
                  className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  <Play className="size-3.5" />
                  Play
                </button>
                <Link
                  href={`/groups/${group.id}/builder?quiz=${q.id}`}
                  aria-label="Edit quiz"
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <Pencil size={15} />
                </Link>
                <button
                  onClick={() => setConfirmDeleteQuiz(q.id)}
                  aria-label="Delete quiz"
                  className="cursor-pointer p-2 rounded-lg text-muted-foreground hover:text-destructive-text hover:bg-destructive-subtle transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Members */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">
          Members ({members.length})
        </h2>
        <div className="flex flex-col gap-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand to-brand-accent flex items-center justify-center text-white text-sm font-medium shrink-0">
                {m.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                  {m.role === "owner" && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-brand-subtle text-brand-text border border-brand-border shrink-0">
                      Owner
                    </span>
                  )}
                  {m.id === userId && (
                    <span className="text-xs text-muted-foreground shrink-0">you</span>
                  )}
                </div>
              </div>
              {m.id !== userId && (
                <button
                  onClick={() => setChallenging({ id: m.id, name: m.name })}
                  aria-label={`Challenge ${m.name} to a duel`}
                  title="Challenge to a duel"
                  className="cursor-pointer p-2 rounded-lg text-muted-foreground hover:text-brand-text hover:bg-brand-subtle transition-colors"
                >
                  <Swords size={15} />
                </button>
              )}
              {/* The owner's row has no action: the RLS policy refuses to
                  delete it, so an owner leaves by deleting the group. */}
              {m.role === "member" && (m.id === userId || isOwner) && (
                <button
                  onClick={() => setConfirmRemove({ id: m.id, name: m.name })}
                  aria-label={m.id === userId ? "Leave group" : "Remove member"}
                  className="cursor-pointer p-2 rounded-lg text-muted-foreground hover:text-destructive-text hover:bg-destructive-subtle transition-colors"
                >
                  {m.id === userId ? <LogOut size={15} /> : <Trash2 size={15} />}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Standings — the same global XP as the main leaderboard, restricted to
          this group's members, so the two boards can never disagree. Members
          with no eligible XP yet simply don't appear. */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Standings</h2>
        {standings.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 px-6 text-center rounded-2xl border border-border bg-card">
            <Medal size={20} className="text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No XP yet</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Standings count XP from the public question pool. Group quizzes build
              the material — they don&apos;t feed the ranking.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {standings.map((s) => (
              <div
                key={s.user_id}
                className={`flex items-center gap-3 p-4 rounded-2xl border border-border ${
                  s.is_me ? "bg-brand-subtle" : "bg-card"
                }`}
              >
                <span className="w-6 text-sm text-muted-foreground shrink-0">{s.rank}</span>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand to-brand-accent flex items-center justify-center text-white text-sm font-medium shrink-0">
                  {s.display_name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      {s.display_name}
                    </p>
                    {s.is_me && (
                      <span className="text-xs text-muted-foreground shrink-0">you</span>
                    )}
                  </div>
                </div>
                <span className="text-sm font-medium text-foreground shrink-0">
                  {s.xp.toLocaleString()} XP
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Challenge to a duel. The challenger picks subject and difficulty; the
          server samples the questions and pins them, so both players get an
          identical set. */}
      <Dialog
        open={challenging !== null}
        onOpenChange={(o) => {
          if (!o) {
            setChallenging(null);
            setDuelError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Challenge {challenging?.name}</DialogTitle>
            <DialogDescription>
              You both answer the same questions, whenever suits you. Higher score
              wins; if you tie, the faster run takes it.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <Select value={duelSubject} onValueChange={setDuelSubject}>
              <SelectTrigger className="rounded-lg border-border bg-background text-foreground cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any subject</SelectItem>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-1.5">
              {(["mixed", "easy", "medium", "hard"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDuelDifficulty(d)}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                    duelDifficulty === d
                      ? "bg-brand-subtle text-brand-text"
                      : "border border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {d === "mixed" ? "Any" : d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>

            <div className="flex gap-1.5">
              {[5, 10, 20].map((n) => (
                <button
                  key={n}
                  onClick={() => setDuelSize(n)}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                    duelSize === n
                      ? "bg-brand-subtle text-brand-text"
                      : "border border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {pluralize(n, "question")}
                </button>
              ))}
            </div>

            {duelError && <p className="text-sm text-destructive-text">{duelError}</p>}
          </div>

          <DialogFooter>
            <button
              onClick={() => setChallenging(null)}
              className="cursor-pointer px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={sendChallenge}
              disabled={sendingDuel}
              className="cursor-pointer disabled:cursor-not-allowed px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {sendingDuel ? "Sending…" : "Send challenge"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New quiz dialog */}
      <Dialog open={creatingQuiz} onOpenChange={setCreatingQuiz}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New group quiz</DialogTitle>
            <DialogDescription>
              Give it a title — you&rsquo;ll add questions next.
            </DialogDescription>
          </DialogHeader>
          <input
            value={quizTitle}
            onChange={(e) => setQuizTitle(e.target.value)}
            placeholder="Quiz title"
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
          />
          <DialogFooter>
            <button
              onClick={() => setCreatingQuiz(false)}
              className="cursor-pointer px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={createQuiz}
              disabled={!quizTitle.trim()}
              className="cursor-pointer disabled:cursor-not-allowed px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              Create
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete quiz confirm */}
      <Dialog
        open={confirmDeleteQuiz !== null}
        onOpenChange={(o) => !o && setConfirmDeleteQuiz(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this quiz?</DialogTitle>
            <DialogDescription>
              Its questions and every recorded attempt of it will be deleted too. This
              can&rsquo;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setConfirmDeleteQuiz(null)}
              className="cursor-pointer px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => confirmDeleteQuiz && deleteQuiz(confirmDeleteQuiz)}
              className="cursor-pointer px-3 py-2 rounded-lg bg-destructive text-white text-sm font-medium hover:bg-destructive-hover transition-colors"
            >
              Delete quiz
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave / remove member confirm */}
      <Dialog
        open={confirmRemove !== null}
        onOpenChange={(o) => !o && setConfirmRemove(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{removeTitle}</DialogTitle>
            <DialogDescription>{removeWarning}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setConfirmRemove(null)}
              className="cursor-pointer px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => confirmRemove && removeMember(confirmRemove.id)}
              className="cursor-pointer px-3 py-2 rounded-lg bg-destructive text-white text-sm font-medium hover:bg-destructive-hover transition-colors"
            >
              {leavingSelf ? "Leave group" : "Remove member"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete group confirm */}
      <Dialog open={confirmDeleteGroup} onOpenChange={setConfirmDeleteGroup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{group.name}&rdquo;?</DialogTitle>
            <DialogDescription>{deleteWarning}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setConfirmDeleteGroup(false)}
              className="cursor-pointer px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={deleteGroup}
              className="cursor-pointer px-3 py-2 rounded-lg bg-destructive text-white text-sm font-medium hover:bg-destructive-hover transition-colors"
            >
              Delete group
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
