"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PenLine } from "lucide-react";

export function BecomeAuthorCard() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function enroll() {
    setLoading(true);
    try {
      const res = await fetch("/api/author/enroll", { method: "POST" });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center text-center gap-4 p-8 rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#4f46e5] to-[#7c3aed]">
        <PenLine className="size-6 text-white" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-foreground">Create your own quizzes</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Become an author to build custom quizzes and assign them to your students. Your quizzes stay
          private to you and the students you share them with.
        </p>
      </div>
      <button
        onClick={enroll}
        disabled={loading}
        className="px-5 py-2.5 rounded-xl bg-[#4f46e5] text-white text-sm font-medium hover:bg-[#4338ca] disabled:opacity-50 transition-colors"
      >
        {loading ? "Enabling…" : "Enable authoring"}
      </button>
    </div>
  );
}
