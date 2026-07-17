"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, GraduationCap, PanelLeftIcon } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { NotificationBell } from "@/app/components/NotificationBell";
import { useSidebar } from "@/app/components/ui/sidebar";

const routeLabels: Record<string, string> = {
  "/": "Quick Play",
  "/advanced": "Deep Dive",
  "/custom": "Create Quiz",
  "/build": "Build Quiz",
  "/dashboard": "Dashboard",
  "/achievements": "Achievements",
  "/quiz": "Quiz in progress",
  "/admin/quiz-builder": "Admin",
  "/my-quizzes": "My Quizzes",
  "/students": "Students",
  "/invite": "Invitation",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function Topbar({ displayName }: { displayName: string }) {
  const pathname = usePathname();
  const { toggleSidebar } = useSidebar();
  const base = "/" + (pathname.split("/")[1] ?? "");
  const label = routeLabels[pathname] ?? routeLabels[base] ?? "Noosphere";

  const initials = getInitials(displayName);

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

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <GraduationCap size={14} />
        <span>Noosphere</span>
        <ChevronRight size={13} />
        <span className="text-foreground font-medium">{label}</span>
      </div>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-2">
        {/* Notification bell */}
        <NotificationBell />

        {/* User avatar → dashboard */}
        <Link
          href="/dashboard"
          className="w-8 h-8 rounded-full bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] flex items-center justify-center text-white text-xs font-medium select-none"
          aria-label="Go to dashboard"
        >
          {initials}
        </Link>
      </div>
    </header>
  );
}
