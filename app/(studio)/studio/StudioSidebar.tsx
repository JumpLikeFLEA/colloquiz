"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, Library, LogOut, PenTool, Shield, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
} from "@/app/components/ui/sidebar";

// Studio nav (SHELL-020, docs/decisions/0109 Decision 11): built from the
// vendored ui/sidebar with the same link classes as AppSidebar's nav, so it
// reads as the same app family without importing the Colloquiz shell.

type NavItem = { label: string; href: string; icon: LucideIcon };

const workItems: NavItem[] = [{ label: "Courses", href: "/studio/courses", icon: Library }];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      prefetch={false}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all",
        active ? "bg-brand-subtle text-brand-text" : "text-foreground hover:bg-accent",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded-lg transition-all shrink-0",
          active ? "bg-brand text-white" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon size={16} />
      </div>
      <p className="flex-1 min-w-0 text-sm font-medium leading-none truncate">{item.label}</p>
    </Link>
  );
}

export function StudioSidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  // "View site" and the admin link leave Studio, so they never show as active.
  // /app/admin has no index page of its own; the review queue is the first
  // entry of AppSidebar's Admin section that stays in Colloquiz.
  const exitItems: NavItem[] = [
    { label: "View site", href: "/", icon: ExternalLink },
    ...(isAdmin ? [{ label: "Colloquiz admin", href: "/app/admin/review", icon: Shield }] : []),
  ];

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand to-brand-accent shrink-0">
            <PenTool size={18} className="text-white" />
          </div>
          <div className="min-w-0 overflow-hidden">
            <p className="font-semibold text-sidebar-foreground leading-none truncate">Studio</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">Course workspace</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        <nav className="flex flex-col gap-1">
          {workItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={pathname === item.href || pathname.startsWith(item.href + "/")}
            />
          ))}
        </nav>
        <div className="mt-4">
          <p className="text-xs text-muted-foreground font-medium tracking-wider px-3 mb-2">Leave Studio</p>
          <nav className="flex flex-col gap-1">
            {exitItems.map((item) => (
              <NavLink key={item.href} item={item} active={false} />
            ))}
          </nav>
        </div>
      </SidebarContent>

      <SidebarFooter className="px-3 py-4 border-t border-sidebar-border">
        {/* The English surface's sign-out (SHELL-019): a plain form POST, no
            browser Supabase client. `next=/` because Studio is gated and a
            signed-out reload here would only bounce to /login. */}
        <form action="/auth/sign-out" method="post">
          <input type="hidden" name="next" value="/" />
          <button
            type="submit"
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-left text-foreground hover:bg-accent transition-all cursor-pointer"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted text-muted-foreground shrink-0">
              <LogOut size={16} />
            </div>
            <span className="text-sm font-medium leading-none">Sign out</span>
          </button>
        </form>
      </SidebarFooter>
    </Sidebar>
  );
}

/** The phone-width way into the sidebar (it renders as a Sheet below md). */
export function StudioTopbar() {
  return (
    <header className="flex items-center gap-3 px-5 py-3.5 border-b border-border bg-card shrink-0">
      <SidebarTrigger className="size-8" aria-label="Toggle sidebar" />
      <span className="text-sm font-medium text-foreground">Studio</span>
    </header>
  );
}
