"use client";

import { useState } from "react";
import Link from "next/link";
import { GraduationCap, Check, AlertCircle } from "lucide-react";

export function InviteAccept({ token }: { token: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [tutorName, setTutorName] = useState("");

  async function accept() {
    setStatus("loading");
    try {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Could not accept this invite.");
        setStatus("error");
        return;
      }
      setTutorName(data.tutorName ?? "your tutor");
      setStatus("done");
    } catch {
      setMessage("Network error. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm flex flex-col items-center text-center gap-5 p-8 rounded-3xl border border-border bg-card">
        {status === "done" ? (
          <>
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-success-subtle">
              <Check className="size-7 text-success" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">You&rsquo;re linked!</h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                You&rsquo;re now connected with{" "}
                <span className="font-medium text-foreground">{tutorName}</span>. Quizzes they assign
                will show up in My Quizzes.
              </p>
            </div>
            <Link
              href="/my-quizzes"
              className="w-full py-3 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
            >
              Go to My Quizzes
            </Link>
          </>
        ) : status === "error" ? (
          <>
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-destructive-subtle">
              <AlertCircle className="size-7 text-destructive-text" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Couldn&rsquo;t accept</h1>
              <p className="text-sm text-muted-foreground mt-1.5">{message}</p>
            </div>
            <Link
              href="/"
              className="w-full py-3 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              Go home
            </Link>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand to-brand-accent">
              <GraduationCap className="size-7 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Tutor invitation</h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                Accept to let this tutor assign quizzes to you and review your results.
              </p>
            </div>
            <button
              onClick={accept}
              disabled={status === "loading"}
              className="w-full py-3 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {status === "loading" ? "Linking…" : "Accept invitation"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
