"use client";

import { useState } from "react";
import { Share2, Copy, Check, Users, AlertCircle } from "lucide-react";

// Results-screen "Share with a friend" block. No Figma source — composed from
// classes already used on the results screen (the duel banner block, rounded-2xl
// cards, the indigo #4f46e5 button, roster-style rows). Shown only for
// public-bank quizzes (see the `shareable` guard in page.tsx), whose questions
// every friend can read.
//
// Two delivery paths over ONE share: a copyable /s/[token] link (reaches anyone,
// incl. an unregistered friend who then onboards), and an in-app picker that
// notifies a group co-member. Both resolve to the same snapshot via share_quiz.

type Target = { id: string; name: string };

export function ShareQuizBlock({ quizId }: { quizId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [sendingId, setSendingId] = useState<string | null>(null);

  const link = token ? `${window.location.origin}/s/${token}` : "";

  // Lazily mint (or reuse) the share on first open.
  async function ensureShare(): Promise<string | null> {
    if (token) return token;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/quiz-shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceQuizId: quizId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not share this quiz.");
        return null;
      }
      setToken(data.token);
      return data.token as string;
    } catch {
      setError("Network error. Please try again.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    // Use the returned token, not the state — setToken hasn't applied yet this tick.
    const t = await ensureShare();
    if (!t) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/s/${t}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the field is selectable as a fallback.
    }
  }

  async function openPicker() {
    if (!(await ensureShare())) return;
    setPickerOpen((v) => !v);
    if (targets === null) {
      try {
        const res = await fetch("/api/quiz-shares/targets");
        const data = await res.json().catch(() => ({}));
        setTargets(res.ok ? (data.targets ?? []) : []);
      } catch {
        setTargets([]);
      }
    }
  }

  async function sendTo(t: Target) {
    if (!token || sentIds.has(t.id) || sendingId) return;
    setSendingId(t.id);
    try {
      const res = await fetch("/api/quiz-shares/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, recipientId: t.id }),
      });
      if (res.ok) setSentIds((prev) => new Set(prev).add(t.id));
      else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not send this quiz.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-5 rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2">
        <Share2 size={16} className="text-[#4f46e5]" />
        <p className="font-medium text-foreground">Share with a friend</p>
      </div>
      <p className="text-sm text-muted-foreground">
        Send this exact quiz to a friend — they play the same questions. Works even if
        they don&rsquo;t have an account yet.
      </p>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-red-200 bg-red-50/60 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!token ? (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={copyLink}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#4f46e5] text-white text-sm font-medium hover:bg-[#4338ca] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Share2 size={15} />
            {loading ? "Creating link…" : "Create share link"}
          </button>
          <button
            onClick={openPicker}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Users size={15} />
            Send to a group member
          </button>
        </div>
      ) : (
        <>
          {/* Copyable link */}
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground"
            />
            <button
              onClick={copyLink}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#4f46e5] text-white text-sm font-medium hover:bg-[#4338ca] transition-colors cursor-pointer shrink-0"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <button
            onClick={openPicker}
            className="flex items-center gap-2 self-start text-sm font-medium text-[#4f46e5] hover:underline cursor-pointer"
          >
            <Users size={15} />
            {pickerOpen ? "Hide group members" : "Send to a group member"}
          </button>

          {pickerOpen && (
            <div className="flex flex-col gap-2">
              {targets === null ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : targets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  You&rsquo;re not in a group with anyone yet. Use the link above instead.
                </p>
              ) : (
                targets.map((t) => {
                  const sent = sentIds.has(t.id);
                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card"
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#eef2ff] text-[#4f46e5] text-xs font-semibold shrink-0">
                        {t.name.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="flex-1 min-w-0 text-sm text-foreground truncate">{t.name}</span>
                      <button
                        onClick={() => sendTo(t)}
                        disabled={sent || sendingId === t.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium disabled:cursor-not-allowed transition-colors cursor-pointer border border-border hover:bg-accent disabled:opacity-60 disabled:hover:bg-transparent"
                      >
                        {sent ? (
                          <>
                            <Check size={14} className="text-emerald-500" /> Sent
                          </>
                        ) : sendingId === t.id ? (
                          "Sending…"
                        ) : (
                          "Send"
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
