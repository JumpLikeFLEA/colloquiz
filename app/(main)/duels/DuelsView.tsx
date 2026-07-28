"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Swords } from "lucide-react";

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
import { tierStyle } from "@/lib/glicko2";
import type { Duel, MyTier } from "@/lib/duels";
import type { DuelTarget } from "@/lib/groups";
import { formatDuration, pluralize } from "@/lib/format";

// The compact inbox row. The info column links to the duel's detail page; the
// action column (accept/decline/play/status) sits outside that link so its
// buttons don't fight the row navigation.
function DuelRow({
  duel,
  onAction,
  busy,
}: {
  duel: Duel;
  onAction: (id: string, action: "accept" | "decline" | "cancel") => void;
  busy: boolean;
}) {
  const label = duel.subject ?? "Mixed";
  const outcomeStyle =
    duel.outcome === "win"
      ? "bg-emerald-50 text-emerald-600 border-emerald-200"
      : duel.outcome === "loss"
        ? "bg-red-50 text-red-500 border-red-200"
        : "bg-muted text-muted-foreground border-border";

  return (
    <div className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card">
      <Link
        href={`/duels/${duel.duel_id}`}
        className="flex items-center gap-3 flex-1 min-w-0 group"
      >
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted text-muted-foreground shrink-0">
          <Swords size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate group-hover:text-brand-text transition-colors">
            vs {duel.opponent_name}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {label} · {pluralize(duel.size, "question")} · {duel.group_name}
            {duel.status === "resolved" && duel.my_correct !== null && (
              <>
                {" · "}
                {duel.my_correct}–{duel.their_correct}
                {duel.my_elapsed !== null && ` in ${formatDuration(duel.my_elapsed, "compact")}`}
              </>
            )}
          </p>
        </div>
      </Link>

      {duel.status === "resolved" && (
        <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${outcomeStyle}`}>
          {duel.outcome === "win" ? "Won" : duel.outcome === "loss" ? "Lost" : "Draw"}
        </span>
      )}

      {duel.status === "declined" && (
        <span className="text-xs px-2 py-0.5 rounded-full border shrink-0 bg-muted text-muted-foreground border-border">
          Declined
        </span>
      )}

      {duel.status === "expired" && (
        <span className="text-xs px-2 py-0.5 rounded-full border shrink-0 bg-muted text-muted-foreground border-border">
          Expired
        </span>
      )}

      {duel.status === "cancelled" && (
        <span className="text-xs px-2 py-0.5 rounded-full border shrink-0 bg-muted text-muted-foreground border-border">
          Cancelled
        </span>
      )}

      {duel.status === "pending" && !duel.is_challenger && (
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={() => onAction(duel.duel_id, "accept")}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-medium hover:bg-brand-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Accept
          </button>
          <button
            onClick={() => onAction(duel.duel_id, "decline")}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Decline
          </button>
        </div>
      )}

      {duel.status === "pending" && duel.is_challenger && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">Awaiting reply</span>
          <button
            onClick={() => onAction(duel.duel_id, "cancel")}
            disabled={busy}
            className="px-2.5 py-1.5 rounded-lg border border-border text-xs hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      )}

      {duel.status === "active" &&
        (duel.i_submitted ? (
          <span className="text-xs text-muted-foreground shrink-0">Waiting for them</span>
        ) : (
          // A plain link: the duel's clock is stamped by the quiz page once the
          // session is confirmed, not by this button.
          <Link
            href={`/quiz/${duel.quiz_id}`}
            className="px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-medium hover:bg-brand-hover transition-colors cursor-pointer shrink-0"
          >
            Play
          </Link>
        ))}
    </div>
  );
}

export function DuelsView({
  duels,
  myTier,
  targets,
  subjects,
  openOpponentIds,
}: {
  duels: Duel[];
  myTier: MyTier;
  targets: DuelTarget[];
  subjects: { id: string; name: string }[];
  openOpponentIds: string[];
}) {
  const router = useRouter();
  const [duelBusy, setDuelBusy] = useState(false);
  const [duelError, setDuelError] = useState<string | null>(null);

  // New-duel flow: pick a co-member (picker), then subject/difficulty/size.
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const [challenging, setChallenging] = useState<{
    opponentId: string;
    opponentName: string;
    groupId: string;
  } | null>(null);
  // "any" rather than "" because a Select item cannot carry an empty value —
  // that is reserved for "nothing selected". Mapped back to null on submit.
  const [duelSubject, setDuelSubject] = useState("any");
  const [duelDifficulty, setDuelDifficulty] = useState<"mixed" | "easy" | "medium" | "hard">(
    "mixed",
  );
  const [duelSize, setDuelSize] = useState(10);
  const [sendingDuel, setSendingDuel] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const openSet = useMemo(() => new Set(openOpponentIds), [openOpponentIds]);
  const filteredTargets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter(
      (t) =>
        t.opponentName.toLowerCase().includes(q) || t.groupName.toLowerCase().includes(q),
    );
  }, [targets, search]);

  function openPicker() {
    setSearch("");
    setPicking(true);
  }

  async function handleDuelAction(id: string, action: "accept" | "decline" | "cancel") {
    setDuelBusy(true);
    setDuelError(null);
    try {
      const res = await fetch(`/api/duels/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDuelError(data.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    } finally {
      setDuelBusy(false);
    }
  }

  async function sendChallenge() {
    if (!challenging) return;
    setSendingDuel(true);
    setSendError(null);
    try {
      const res = await fetch("/api/duels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opponentId: challenging.opponentId,
          groupId: challenging.groupId,
          subject: duelSubject === "any" ? null : duelSubject,
          difficulty: duelDifficulty,
          size: duelSize,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data.error ?? "Could not send the challenge.");
        return;
      }
      // Already on /duels — refresh so the new pending duel appears in the inbox.
      setChallenging(null);
      router.refresh();
    } finally {
      setSendingDuel(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-foreground">Duels</h1>
          <p className="text-muted-foreground mt-1">
            Async 1v1 challenges with your group co-members
          </p>
        </div>
        <button
          onClick={openPicker}
          className="cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors shrink-0"
        >
          <Plus size={16} />
          New duel
        </button>
      </div>

      {/* Your placement progress */}
      <div className="flex items-center gap-4 p-5 rounded-2xl border border-border bg-card">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
          style={{
            backgroundColor: tierStyle(myTier.tier).bg,
            color: tierStyle(myTier.tier).color,
          }}
        >
          <Swords size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground leading-none">
            {tierStyle(myTier.tier).label}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {myTier.placement_remaining > 0
              ? `${myTier.placement_remaining} more duel${
                  myTier.placement_remaining === 1 ? "" : "s"
                } to earn a tier`
              : `${myTier.matches_played} duels played`}
          </p>
        </div>
        <Link
          href="/leaderboard?tab=competitive"
          className="text-xs text-brand-text hover:underline shrink-0"
        >
          Rankings →
        </Link>
      </div>

      {duelError && (
        <div className="p-4 rounded-2xl border border-red-200 bg-red-50">
          <p className="text-sm text-red-600">{duelError}</p>
        </div>
      )}

      {/* Duel inbox */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Your duels</h2>
        {duels.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 px-6 text-center rounded-2xl border border-border bg-card">
            <Swords size={20} className="text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No duels yet</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Challenge a co-member from one of your groups to an async 1v1.
            </p>
            {targets.length > 0 ? (
              <button
                onClick={openPicker}
                className="mt-2 cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
              >
                <Plus size={16} />
                New duel
              </button>
            ) : (
              <Link
                href="/groups"
                className="mt-2 text-xs text-brand-text hover:underline"
              >
                Go to groups →
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {duels.map((d) => (
              <DuelRow
                key={d.duel_id}
                duel={d}
                onAction={handleDuelAction}
                busy={duelBusy}
              />
            ))}
          </div>
        )}
      </div>

      {/* New-duel picker: choose a co-member to challenge */}
      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New duel</DialogTitle>
            <DialogDescription>
              Challenge a co-member from one of your groups.
            </DialogDescription>
          </DialogHeader>

          {targets.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 px-6 text-center">
              <Swords size={20} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground max-w-xs">
                You&apos;re not in a group with anyone to duel yet. Join or create a
                group first.
              </p>
              <Link
                href="/groups"
                onClick={() => setPicking(false)}
                className="text-xs text-brand-text hover:underline"
              >
                Go to groups →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search people or groups"
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
              />
              <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
                {filteredTargets.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No matches.
                  </p>
                ) : (
                  filteredTargets.map((t) => {
                    const busy = openSet.has(t.opponentId);
                    return (
                      <button
                        key={`${t.groupId}:${t.opponentId}`}
                        disabled={busy}
                        onClick={() => {
                          setSendError(null);
                          setChallenging({
                            opponentId: t.opponentId,
                            opponentName: t.opponentName,
                            groupId: t.groupId,
                          });
                          setPicking(false);
                        }}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                          busy
                            ? "border-border bg-muted/40 cursor-not-allowed"
                            : "border-border bg-card hover:bg-accent cursor-pointer"
                        }`}
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted text-muted-foreground shrink-0">
                          <Swords size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {t.opponentName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {t.groupName}
                          </p>
                        </div>
                        {busy && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            duel in progress
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Challenge params — same controls as the group challenge dialog */}
      <Dialog
        open={challenging !== null}
        onOpenChange={(o) => {
          if (!o) {
            setChallenging(null);
            setSendError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Challenge {challenging?.opponentName}</DialogTitle>
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

            {sendError && <p className="text-sm text-red-600">{sendError}</p>}
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
    </div>
  );
}
