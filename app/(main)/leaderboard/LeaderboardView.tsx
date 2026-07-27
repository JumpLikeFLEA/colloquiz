"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crown, EyeOff, Eye, Medal, Swords, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
// Type-only: lib/leaderboard.ts reaches next/headers through the server
// Supabase client, so importing any VALUE from it would drag that into the
// browser bundle. The window labels below are presentational anyway.
import type {
  LeaderboardRow,
  LeaderboardWindow,
  MyRank,
} from "@/lib/leaderboard";

const LEADERBOARD_WINDOWS: { value: LeaderboardWindow; label: string }[] = [
  { value: "7d", label: "This week" },
  { value: "30d", label: "This month" },
  { value: "all", label: "All time" },
];
import { tierStyle, type TierId } from "@/lib/glicko2";
import type { CompetitiveRow, MyTier } from "@/lib/duels";

const NOTICE_KEY = "colloquiz.leaderboard.notice.dismissed";
const NOTICE_EVENT = "colloquiz:leaderboard-notice";

// localStorage is unavailable during SSR, so the dismissed flag is read through
// an external store instead of being mirrored into state from an effect. The
// server snapshot reports "dismissed" so the notice never appears in server
// HTML; the client re-reads the real value after hydration.
function subscribeNotice(onStoreChange: () => void) {
  window.addEventListener(NOTICE_EVENT, onStoreChange);
  return () => window.removeEventListener(NOTICE_EVENT, onStoreChange);
}

function getNoticeDismissed() {
  return localStorage.getItem(NOTICE_KEY) !== null;
}

function getNoticeDismissedOnServer() {
  return true;
}

function TierBadge({ tier }: { tier: TierId | null }) {
  if (!tier || tier === "unranked") return null;
  const s = tierStyle(tier);
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full border shrink-0"
      style={{ backgroundColor: s.bg, color: s.color, borderColor: s.color + "40" }}
    >
      {s.label}
    </span>
  );
}

// Top three get a colour; everyone else reads as a plain numeral.
const MEDAL: Record<number, { color: string; bg: string }> = {
  1: { color: "#f59e0b", bg: "#fffbeb" },
  2: { color: "#6b7280", bg: "#f9fafb" },
  3: { color: "#b45309", bg: "#fff7ed" },
};

function RankBadge({ rank }: { rank: number }) {
  const medal = MEDAL[rank];
  return (
    <div
      className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0 text-sm font-medium"
      style={
        medal
          ? { backgroundColor: medal.bg, color: medal.color }
          : undefined
      }
    >
      {medal ? <Medal size={16} /> : <span className="text-muted-foreground">{rank}</span>}
    </div>
  );
}

function Row({ row }: { row: LeaderboardRow }) {
  const initials = row.display_name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 ${
        row.is_me ? "bg-[#eef2ff]" : ""
      }`}
    >
      <RankBadge rank={row.rank} />
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] flex items-center justify-center text-white text-sm font-medium shrink-0 select-none">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium leading-none truncate ${
            row.is_me ? "text-[#4f46e5]" : "text-foreground"
          }`}
        >
          {row.display_name}
          {row.is_me && <span className="text-xs text-muted-foreground ml-2">you</span>}
        </p>
      </div>
      <TierBadge tier={row.tier as TierId | null} />
      <span className="text-sm font-medium text-foreground shrink-0">
        {row.xp.toLocaleString()} XP
      </span>
    </div>
  );
}

export function LeaderboardView({
  rows,
  myRank,
  subjects,
  activeSubject,
  activeWindow,
  userId,
  publicName,
  optedOut,
  activeTab,
  competitive,
  myTier,
}: {
  rows: LeaderboardRow[];
  myRank: MyRank | null;
  subjects: { id: string; name: string; players: number }[];
  activeSubject: string | null;
  activeWindow: LeaderboardWindow;
  userId: string;
  publicName: string;
  optedOut: boolean;
  activeTab: "casual" | "competitive";
  competitive: CompetitiveRow[];
  myTier: MyTier;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(optedOut);
  const [saving, setSaving] = useState(false);
  const showNotice = !useSyncExternalStore(
    subscribeNotice,
    getNoticeDismissed,
    getNoticeDismissedOnServer,
  );

  function dismissNotice() {
    localStorage.setItem(NOTICE_KEY, "1");
    window.dispatchEvent(new Event(NOTICE_EVENT));
  }

  function navigate(next: { subject?: string | null; window?: LeaderboardWindow }) {
    const params = new URLSearchParams();
    const subject = next.subject !== undefined ? next.subject : activeSubject;
    const win = next.window ?? activeWindow;
    if (subject) params.set("subject", subject);
    params.set("window", win);
    startTransition(() => router.replace(`/leaderboard?${params.toString()}`));
  }

  async function toggleHidden() {
    setSaving(true);
    const nextValue = !hidden;
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ leaderboard_opt_out: nextValue })
      .eq("id", userId);
    setSaving(false);
    if (error) return;
    setHidden(nextValue);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-foreground">Leaderboard</h1>
        <p className="text-muted-foreground mt-1">
          {activeTab === "casual"
            ? "Ranked by XP from public-pool quizzes"
            : "Ranked by duel performance"}
        </p>
      </div>

      {/* Casual / Competitive */}
      <div className="flex gap-2">
        {(["casual", "competitive"] as const).map((t) => (
          <button
            key={t}
            onClick={() =>
              startTransition(() =>
                router.replace(t === "casual" ? "/leaderboard" : "/leaderboard?tab=competitive"),
              )
            }
            className={`px-3.5 py-1.5 rounded-full text-sm transition-all cursor-pointer ${
              activeTab === t
                ? "bg-[#4f46e5] text-white"
                : "border border-border hover:bg-accent text-foreground"
            }`}
          >
            {t === "casual" ? "Casual" : "Competitive"}
          </button>
        ))}
      </div>

      {/* One-time privacy notice */}
      {showNotice && (
        <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-900">
              You appear here as &ldquo;{publicName}&rdquo;
            </p>
            <p className="text-sm text-amber-700 mt-1">
              Only this public name and your XP are shown to other learners — never your
              full name, email or city. Change it on the Dashboard, or hide yourself below.
            </p>
          </div>
          <button
            onClick={dismissNotice}
            aria-label="Dismiss"
            className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-100 transition-colors cursor-pointer shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {activeTab === "casual" && (
      <>
      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigate({ subject: null })}
            className={`px-3.5 py-1.5 rounded-full text-sm transition-all cursor-pointer ${
              activeSubject === null
                ? "bg-[#4f46e5] text-white"
                : "border border-border hover:bg-accent text-foreground"
            }`}
          >
            All subjects
          </button>
          {subjects.map((s) => (
            <button
              key={s.id}
              onClick={() => navigate({ subject: s.id })}
              className={`px-3.5 py-1.5 rounded-full text-sm transition-all cursor-pointer ${
                activeSubject === s.id
                  ? "bg-[#4f46e5] text-white"
                  : "border border-border hover:bg-accent text-foreground"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5">
          {LEADERBOARD_WINDOWS.map((w) => (
            <button
              key={w.value}
              onClick={() => navigate({ window: w.value })}
              className={`px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                activeWindow === w.value
                  ? "bg-[#eef2ff] text-[#4f46e5]"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {w.label}
            </button>
          ))}
          <button
            onClick={toggleHidden}
            disabled={saving}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-accent transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {hidden ? <Eye size={13} /> : <EyeOff size={13} />}
            {hidden ? "Show me on the board" : "Hide me"}
          </button>
        </div>
      </div>

      {/* Standings */}
      <div
        className={`rounded-2xl border border-border bg-card overflow-hidden transition-opacity ${
          pending ? "opacity-60" : ""
        }`}
      >
        {hidden ? (
          <div className="flex flex-col items-center gap-2 py-14 px-6 text-center">
            <EyeOff size={20} className="text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">You&apos;re hidden</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              You still earn XP as normal — you just don&apos;t appear in anyone&apos;s
              standings. Others are still ranked below.
            </p>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 px-6 text-center">
            <Crown size={20} className="text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No one here yet</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              {activeWindow === "all"
                ? "Complete a quiz from the public question pool to claim the top spot."
                : "Nobody has earned XP in this period. Play a quiz to take the lead."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <Row key={r.user_id} row={r} />
            ))}
          </div>
        )}
      </div>

      {/* Your standing, when you're outside the visible page */}
      {myRank && !rows.some((r) => r.is_me) && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <Row
            row={{
              rank: myRank.rank,
              user_id: myRank.user_id,
              display_name: myRank.display_name,
              xp: myRank.xp,
              tier: myRank.tier,
              is_me: true,
            }}
          />
        </div>
      )}

      {myRank && (
        <p className="text-xs text-muted-foreground text-center">
          You&apos;re #{myRank.rank} of {myRank.total_ranked} ranked learners
          {activeSubject ? " in this subject" : ""}.
        </p>
      )}
      </>
      )}

      {activeTab === "competitive" && (
      <>
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
        </div>

        {/* Duels live on their own page now */}
        <Link
          href="/duels"
          className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card hover:bg-accent transition-colors"
        >
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted text-muted-foreground shrink-0">
            <Swords size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Your duels</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Challenges to answer, legs to play, and results
            </p>
          </div>
          <span className="text-sm text-[#4f46e5] shrink-0">Open →</span>
        </Link>

        {/* Ranked players */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Ranked players</h2>
          {competitive.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 px-6 text-center rounded-2xl border border-border bg-card">
              <Crown size={20} className="text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Nobody is ranked yet</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                A tier appears after 5 duels, so the first ranks show up once people
                have played their placements.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
              {competitive.map((c) => (
                <div
                  key={c.user_id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    c.is_me ? "bg-[#eef2ff]" : ""
                  }`}
                >
                  <RankBadge rank={c.rank} />
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] flex items-center justify-center text-white text-sm font-medium shrink-0 select-none">
                    {c.display_name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium leading-none truncate ${
                        c.is_me ? "text-[#4f46e5]" : "text-foreground"
                      }`}
                    >
                      {c.display_name}
                      {c.is_me && (
                        <span className="text-xs text-muted-foreground ml-2">you</span>
                      )}
                    </p>
                  </div>
                  <TierBadge tier={c.tier} />
                  <span className="text-xs text-muted-foreground shrink-0">
                    {c.matches_played} duels
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
      )}
    </div>
  );
}
