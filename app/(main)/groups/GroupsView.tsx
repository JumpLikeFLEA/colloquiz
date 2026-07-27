"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users, Plus, ChevronRight, BookOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import type { MyGroup } from "@/lib/groups";
import { pluralize } from "@/lib/format";

export function GroupsView({ groups }: { groups: MyGroup[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create the group.");
        return;
      }
      setCreating(false);
      setName("");
      setDescription("");
      router.push(`/groups/${data.groupId}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Groups</h1>
          <p className="text-muted-foreground mt-1">
            Build quizzes together, review each other&rsquo;s questions, and study as a team.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#4f46e5] text-white text-sm font-medium hover:bg-[#4338ca] transition-colors shrink-0"
        >
          <Plus className="size-4" />
          New group
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground rounded-2xl border border-dashed border-border">
          <Users size={32} className="mb-2 opacity-40" />
          <p className="text-sm">
            You&rsquo;re not in any groups yet. Create one, or open an invite link.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((g) => (
            <Link
              key={g.id}
              href={`/groups/${g.id}`}
              className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card hover:bg-accent transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] flex items-center justify-center text-white text-sm font-medium shrink-0">
                {g.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">{g.name}</p>
                  {g.role === "owner" && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#eef2ff] text-[#4f46e5] border border-[#c7d2fe] shrink-0">
                      Owner
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <Users size={12} />
                    {pluralize(g.memberCount, "member")}
                  </span>
                  <span className="flex items-center gap-1">
                    <BookOpen size={12} />
                    {g.quizCount} {g.quizCount === 1 ? "quiz" : "quizzes"}
                  </span>
                </p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New group</DialogTitle>
            <DialogDescription>
              You&rsquo;ll be the owner. Invite people with a link once it&rsquo;s created.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Group name"
              maxLength={60}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this group for? (optional)"
              rows={3}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none resize-none"
            />
            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <button
              onClick={() => setCreating(false)}
              className="cursor-pointer px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={create}
              disabled={saving || name.trim().length < 2}
              className="cursor-pointer disabled:cursor-not-allowed px-3 py-2 rounded-lg bg-[#4f46e5] text-white text-sm font-medium hover:bg-[#4338ca] disabled:opacity-50 transition-colors"
            >
              {saving ? "Creating…" : "Create group"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
