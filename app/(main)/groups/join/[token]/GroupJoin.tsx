"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, Check, AlertCircle } from "lucide-react";

// Adapted from invite/[token]/InviteAccept.tsx — same three-state card, with
// group copy and a link into the joined group.
export function GroupJoin({ token }: { token: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupId, setGroupId] = useState("");

  async function join() {
    setStatus("loading");
    try {
      const res = await fetch("/api/groups/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Could not join this group.");
        setStatus("error");
        return;
      }
      setGroupName(data.groupName ?? "the group");
      setGroupId(data.groupId ?? "");
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
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-100">
              <Check className="size-7 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">You&rsquo;re in!</h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                You joined <span className="font-medium text-foreground">{groupName}</span>. You
                can now add questions and review what other members write.
              </p>
            </div>
            <Link
              href={groupId ? `/groups/${groupId}` : "/groups"}
              className="w-full py-3 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
            >
              Open group
            </Link>
          </>
        ) : status === "error" ? (
          <>
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-red-100">
              <AlertCircle className="size-7 text-red-500" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Couldn&rsquo;t join</h1>
              <p className="text-sm text-muted-foreground mt-1.5">{message}</p>
            </div>
            <Link
              href="/groups"
              className="w-full py-3 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              Go to Groups
            </Link>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand to-brand-accent">
              <Users className="size-7 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Group invitation</h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                Join to build quizzes with this group and review each other&rsquo;s questions.
              </p>
            </div>
            <button
              onClick={join}
              disabled={status === "loading"}
              className="cursor-pointer disabled:cursor-not-allowed w-full py-3 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {status === "loading" ? "Joining…" : "Join group"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
