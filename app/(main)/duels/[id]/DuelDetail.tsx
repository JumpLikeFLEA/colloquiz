"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Swords } from "lucide-react";

import type { Duel } from "@/lib/duels";
import { formatDuration, pluralize } from "@/lib/format";

function formatDeadline(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// One side of the resolved-duel score comparison.
function ScoreSide({
  name,
  correct,
  total,
  elapsed,
  won,
  me,
}: {
  name: string;
  correct: number | null;
  total: number | null;
  elapsed: number | null;
  won: boolean;
  me: boolean;
}) {
  return (
    <div
      className={`flex-1 min-w-0 p-4 rounded-2xl border text-center ${
        won ? "border-emerald-200 bg-emerald-50" : "border-border bg-card"
      }`}
    >
      <p className={`text-sm font-medium truncate ${me ? "text-[#4f46e5]" : "text-foreground"}`}>
        {me ? "You" : name}
      </p>
      <p className="text-2xl font-semibold text-foreground mt-2">
        {correct ?? "—"}
        {total !== null && <span className="text-sm text-muted-foreground">/{total}</span>}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {elapsed !== null ? formatDuration(elapsed, "compact") : "no submission"}
      </p>
    </div>
  );
}

export function DuelDetail({ duel }: { duel: Duel }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = duel.subject ?? "Mixed";
  const deadline = formatDeadline(duel.deadline_at);

  async function act(action: "accept" | "decline" | "cancel") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/duels/${duel.duel_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const outcomeBanner =
    duel.status === "resolved"
      ? duel.outcome === "win"
        ? { text: "You won", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" }
        : duel.outcome === "loss"
          ? { text: "You lost", cls: "border-red-200 bg-red-50 text-red-600" }
          : { text: "Draw", cls: "border-border bg-muted text-muted-foreground" }
      : null;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <Link
        href="/duels"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft size={15} /> All duels
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-muted text-muted-foreground shrink-0">
          <Swords size={22} />
        </div>
        <div className="min-w-0">
          <h1 className="text-foreground leading-tight">vs {duel.opponent_name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {label} · {pluralize(duel.size, "question")} · {duel.group_name}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl border border-red-200 bg-red-50">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Pending — you were challenged */}
      {duel.status === "pending" && !duel.is_challenger && (
        <div className="flex flex-col gap-4 p-5 rounded-2xl border border-border bg-card">
          <p className="text-sm text-foreground">
            <b>{duel.opponent_name}</b> challenged you to a duel. Accept to unlock the
            quiz — you&apos;ll have 3 days to play once you do.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => act("accept")}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-[#4f46e5] text-white text-sm font-medium hover:bg-[#4338ca] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Accept challenge
            </button>
            <button
              onClick={() => act("decline")}
              disabled={busy}
              className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Pending — you challenged */}
      {duel.status === "pending" && duel.is_challenger && (
        <div className="flex flex-col gap-4 p-5 rounded-2xl border border-border bg-card">
          <p className="text-sm text-muted-foreground">
            Waiting for <b className="text-foreground">{duel.opponent_name}</b>{" "}to accept.
            You&apos;ll be notified the moment they do.
          </p>
          <button
            onClick={() => act("cancel")}
            disabled={busy}
            className="w-fit px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel challenge
          </button>
        </div>
      )}

      {/* Active — your move */}
      {duel.status === "active" && !duel.i_submitted && (
        <div className="flex flex-col gap-4 p-5 rounded-2xl border border-[#4f46e5]/30 bg-[#eef2ff]">
          <div>
            <p className="text-sm font-medium text-foreground">It&apos;s your turn to play.</p>
            <p className="text-sm text-muted-foreground mt-1">
              The 15-minute clock starts when you open the quiz, not before.
              {deadline && (
                <>
                  {" "}
                  <span className="inline-flex items-center gap-1">
                    <Clock size={13} /> Play by {deadline}.
                  </span>
                </>
              )}
            </p>
          </div>
          <Link
            href={`/quiz/${duel.quiz_id}`}
            className="w-fit px-4 py-2 rounded-lg bg-[#4f46e5] text-white text-sm font-medium hover:bg-[#4338ca] transition-colors cursor-pointer"
          >
            Play your leg
          </Link>
        </div>
      )}

      {/* Active — you're done, waiting */}
      {duel.status === "active" && duel.i_submitted && (
        <div className="p-5 rounded-2xl border border-border bg-card">
          <p className="text-sm text-foreground">
            You&apos;ve played your leg
            {duel.my_correct !== null && (
              <>
                {" "}
                — scored <b>{duel.my_correct}/{duel.size}</b>
                {duel.my_elapsed !== null && ` in ${formatDuration(duel.my_elapsed, "compact")}`}
              </>
            )}
            . Waiting for <b>{duel.opponent_name}</b>{" "}to finish; you&apos;ll be notified
            when the duel resolves.
          </p>
        </div>
      )}

      {/* Resolved */}
      {duel.status === "resolved" && (
        <div className="flex flex-col gap-4">
          {outcomeBanner && (
            <div className={`p-4 rounded-2xl border text-center ${outcomeBanner.cls}`}>
              <p className="text-base font-semibold">{outcomeBanner.text}</p>
            </div>
          )}
          <div className="flex items-stretch gap-3">
            <ScoreSide
              name="You"
              me
              correct={duel.my_correct}
              total={duel.size}
              elapsed={duel.my_elapsed}
              won={duel.outcome === "win"}
            />
            <ScoreSide
              name={duel.opponent_name}
              me={false}
              correct={duel.their_correct}
              total={duel.size}
              elapsed={duel.their_elapsed}
              won={duel.outcome === "loss"}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Higher score wins; a tie on score is broken by the faster time.
          </p>
        </div>
      )}

      {/* Declined */}
      {duel.status === "declined" && (
        <div className="p-5 rounded-2xl border border-border bg-card">
          <p className="text-sm text-muted-foreground">
            {duel.is_challenger ? (
              <>
                <b className="text-foreground">{duel.opponent_name}</b> declined this challenge.
              </>
            ) : (
              <>You declined this challenge.</>
            )}
          </p>
        </div>
      )}

      {/* Expired */}
      {duel.status === "expired" && (
        <div className="p-5 rounded-2xl border border-border bg-card">
          <p className="text-sm text-muted-foreground">
            This challenge expired unanswered after 7 days. No rating changed.
          </p>
        </div>
      )}

      {/* Cancelled */}
      {duel.status === "cancelled" && (
        <div className="p-5 rounded-2xl border border-border bg-card">
          <p className="text-sm text-muted-foreground">
            {duel.is_challenger ? (
              <>You withdrew this challenge.</>
            ) : (
              <>
                <b className="text-foreground">{duel.opponent_name}</b>{" "}withdrew this
                challenge.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
