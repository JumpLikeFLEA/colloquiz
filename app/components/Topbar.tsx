"use client";

import { usePathname } from "next/navigation";
import { ChevronRight, GraduationCap, PanelLeftIcon } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { FeedbackDialog } from "@/app/components/FeedbackDialog";
import { NotificationBell } from "@/app/components/NotificationBell";
import { useSidebar } from "@/app/components/ui/sidebar";

const routeLabels: Record<string, string> = {
  "/": "Quick Play",
  "/advanced": "Deep Dive",
  "/custom": "Create Quiz",
  "/build": "Build Quiz",
  "/progress": "Progress",
  "/quiz": "Quiz in progress",
  // Every /admin/* route has two segments, so it always renders a breadcrumb —
  // and without an entry here each one fell through to the "Colloquiz" default
  // and read "Colloquiz › Colloquiz". Labels match the sidebar's wording so the
  // crumb names the page you actually clicked. "/admin" is the base fallback
  // (see the segment matching below), so a future admin route gets "Admin"
  // rather than the bug.
  "/admin": "Admin",
  "/admin/quiz-builder": "Quiz Builder",
  "/admin/review": "Review Queue",
  "/admin/feedback": "Feedback",
  "/my-quizzes": "My Quizzes",
  "/students": "Students",
  "/invite": "Invitation",
  // Matched by first path segment below, so this also covers /groups/[id],
  // /groups/[id]/review, /groups/[id]/builder and /groups/join/[token] —
  // the same base-level convention /my-quizzes/builder already relies on.
  "/groups": "Groups",
  // Keyed on the first segment (see the base match below), so this covers
  // /courses, /courses/[slug] and /courses/[slug]/[stage] alike.
  "/courses": "Courses",
};

export function Topbar({ displayName: _displayName }: { displayName: string }) {
  const pathname = usePathname();
  const { toggleSidebar } = useSidebar();
  const segments = pathname.split("/").filter(Boolean);
  const base = "/" + (segments[0] ?? "");
  const label = routeLabels[pathname] ?? routeLabels[base] ?? "Colloquiz";
  // Top-level pages (depth 0-1, e.g. "/", "/advanced", "/groups") would render a
  // one-level crumb pointing at the page you're already on — pure noise. Show the
  // breadcrumb only for genuinely nested screens ("/groups/[id]", "/duels/[id]").
  // Derived from segment count, so new top-level routes get this automatically.
  const showBreadcrumb = segments.length > 1;

  return (
    <header className="flex items-center gap-3 px-5 py-3.5 border-b border-border bg-card shrink-0">
      {/* Sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
      >
        <PanelLeftIcon className="size-4" />
      </Button>

      {/* Breadcrumb — nested screens only */}
      {showBreadcrumb && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <GraduationCap size={14} />
          <span>Colloquiz</span>
          <ChevronRight size={13} />
          <span className="text-foreground font-medium">{label}</span>
        </div>
      )}

      {/* Right side */}
      <div className="ml-auto flex items-center gap-2">
        {/* Feedback — text, not an icon: no glyph reliably reads as "tell us
            what you think". Lives in the top bar rather than the sidebar so it
            survives the sidebar collapsing to an icon rail. */}
        <FeedbackDialog />
        {/* Notification bell */}
        <NotificationBell />
      </div>
    </header>
  );
}
