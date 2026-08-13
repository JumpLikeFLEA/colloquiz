"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  Bell,
  CheckCircle2,
  ClipboardList,
  FileCheck,
  Flag,
  Swords,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import { ACHIEVEMENTS } from "@/lib/achievements";
import type { AppNotification } from "@/types";

const achievementTitle = (id: string) =>
  ACHIEVEMENTS.find((a) => a.id === id)?.title ?? "an achievement";

function relativeTime(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

type Rendered = {
  icon: ComponentType<{ size?: number; className?: string }>;
  message: ReactNode;
  href?: string;
};

// Maps a notification to its icon, one-line message and optional deep link.
// Unknown/legacy types fall through to a generic row rather than crashing.
function render(n: AppNotification): Rendered {
  const p = n.payload as Record<string, unknown>;
  switch (n.type) {
    case "report_resolved":
      return {
        icon: Flag,
        message: (
          <>
            Your reported question was <b>{String(p.resolution ?? "reviewed")}</b>.
          </>
        ),
      };
    case "invite_accepted":
      return {
        icon: UserPlus,
        message: (
          <>
            <b>{String(p.student_name ?? "A student")}</b> joined as your student.
          </>
        ),
      };
    case "assignment_created":
      return {
        icon: ClipboardList,
        message: (
          <>
            <b>{String(p.tutor_name ?? "Your tutor")}</b> assigned you{" "}
            {p.quiz_title ? <b>&ldquo;{String(p.quiz_title)}&rdquo;</b> : "a quiz"}.
          </>
        ),
        href: p.quiz_id ? `/quiz/${String(p.quiz_id)}` : undefined,
      };
    case "assignment_completed":
      return {
        icon: CheckCircle2,
        message: (
          <>
            <b>{String(p.student_name ?? "A student")}</b> completed{" "}
            {p.quiz_title ? (
              <b>&ldquo;{String(p.quiz_title)}&rdquo;</b>
            ) : (
              "an assignment"
            )}
            .
          </>
        ),
        href: p.assignment_id
          ? `/students/review/${String(p.assignment_id)}`
          : undefined,
      };
    case "achievement_unlocked":
      return {
        icon: Trophy,
        message: (
          <>
            Achievement unlocked:{" "}
            <b>{achievementTitle(String(p.achievement_id))}</b>.
          </>
        ),
        href: "/progress?tab=achievements",
      };
    case "question_reviewed":
      return {
        icon: FileCheck,
        message: (
          <>
            Your question was <b>{String(p.status ?? "reviewed")}</b>.
          </>
        ),
        // Group peer review reuses this same trigger (013), so a group
        // question's verdict lands here too — deep-link to its group when the
        // payload carries one.
        href: p.group_id ? `/groups/${String(p.group_id)}/review` : "/my-quizzes",
      };
    case "group_member_joined":
      return {
        icon: Users,
        message: (
          <>
            <b>{String(p.member_name ?? "Someone")}</b> joined{" "}
            {p.group_name ? <b>{String(p.group_name)}</b> : "your group"}.
          </>
        ),
        href: p.group_id ? `/groups/${String(p.group_id)}` : "/groups",
      };
    case "group_question_pending":
      return {
        icon: FileCheck,
        message: (
          <>
            <b>{String(p.author_name ?? "A member")}</b> added a question to{" "}
            {p.group_name ? <b>{String(p.group_name)}</b> : "your group"} for review.
          </>
        ),
        href: p.group_id ? `/groups/${String(p.group_id)}/review` : "/groups",
      };
    // Duel notifications (017). The payloads deliberately carry only the
    // outcome — never a rating number, which is hidden by design.
    case "duel_challenge":
      return {
        icon: Swords,
        message: (
          <>
            <b>{String(p.from ?? "Someone")}</b> challenged you to a duel
            {p.subject ? <> on <b>{String(p.subject)}</b></> : null}.
          </>
        ),
        href: p.duel_id ? `/duels/${String(p.duel_id)}` : "/leaderboard?tab=competitive",
      };
    case "duel_accepted":
      return {
        icon: Swords,
        message: (
          <>
            <b>{String(p.by ?? "Your opponent")}</b> accepted your duel — it&rsquo;s
            your turn to play.
          </>
        ),
        href: p.duel_id ? `/duels/${String(p.duel_id)}` : "/leaderboard?tab=competitive",
      };
    case "duel_declined":
      return {
        icon: Swords,
        message: (
          <>
            <b>{String(p.by ?? "Your opponent")}</b> declined your duel.
          </>
        ),
        href: p.duel_id ? `/duels/${String(p.duel_id)}` : "/leaderboard?tab=competitive",
      };
    case "duel_resolved":
      return {
        icon: Swords,
        message:
          p.outcome === "win" ? (
            <>You <b>won</b> your duel.</>
          ) : p.outcome === "loss" ? (
            <>You <b>lost</b> your duel.</>
          ) : (
            <>Your duel ended in a <b>draw</b>.</>
          ),
        href: p.duel_id ? `/duels/${String(p.duel_id)}` : "/leaderboard?tab=competitive",
      };
    case "duel_expired":
      return {
        icon: Swords,
        message: (
          <>
            Your duel challenge <b>expired</b> unanswered.
          </>
        ),
        href: p.duel_id ? `/duels/${String(p.duel_id)}` : "/leaderboard?tab=competitive",
      };
    case "duel_cancelled":
      return {
        icon: Swords,
        message: (
          <>
            <b>{String(p.by ?? "Your opponent")}</b> withdrew their duel challenge.
          </>
        ),
        href: p.duel_id ? `/duels/${String(p.duel_id)}` : "/leaderboard?tab=competitive",
      };
    default:
      return { icon: Bell, message: <>You have a new notification.</> };
  }
}

export function NotificationBell({ initialUnread = 0 }: { initialUnread?: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  // Seeded from the server render (layout), so the dot is right on first paint
  // without a mount fetch. Refreshed by the realtime nudge and on popover open.
  const [unread, setUnread] = useState(initialUnread);
  // Ids that were unread when the popover opened — kept marked while it stays
  // open even though the PATCH has already cleared read_at server-side.
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Realtime nudge from DuelRealtime: a notification just arrived. Light the dot
  // immediately; the full list is refetched when the popover next opens.
  useEffect(() => {
    const onNew = () => setUnread((u) => u + 1);
    window.addEventListener("notification:new", onNew);
    return () => window.removeEventListener("notification:new", onNew);
  }, []);

  const handleOpenChange = useCallback(async (next: boolean) => {
    setOpen(next);
    if (!next) return;
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const d = await res.json();
        const list: AppNotification[] = d.notifications ?? [];
        setItems(list);
        setUnreadIds(
          new Set(list.filter((n) => n.read_at == null).map((n) => n.id)),
        );
        if ((d.unread ?? 0) > 0) {
          await fetch("/api/notifications", { method: "PATCH" });
        }
        setUnread(0);
      }
    } catch {
      // Non-fatal: a failed fetch just shows the last known state.
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="relative p-2 rounded-xl hover:bg-accent transition-colors cursor-pointer"
          aria-label="Notifications"
        >
          <Bell size={17} className="text-muted-foreground" />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-medium text-foreground">Notifications</p>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {loading && items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              Loading…
            </p>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              No notifications yet
            </p>
          ) : (
            items.map((n) => {
              const { icon: Icon, message, href } = render(n);
              const wasUnread = unreadIds.has(n.id);
              const body = (
                <div
                  className={`flex gap-3 px-4 py-3 ${
                    href ? "hover:bg-accent transition-colors" : ""
                  }`}
                >
                  <span className="mt-0.5 shrink-0">
                    <Icon size={16} className="text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-foreground">
                      {message}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {relativeTime(n.created_at)}
                    </span>
                  </span>
                  {wasUnread && (
                    <span className="mt-1.5 shrink-0 w-2 h-2 rounded-full bg-brand" />
                  )}
                </div>
              );
              return href ? (
                <Link
                  key={n.id}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="block border-b border-border last:border-0"
                >
                  {body}
                </Link>
              ) : (
                <div
                  key={n.id}
                  className="border-b border-border last:border-0"
                >
                  {body}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
