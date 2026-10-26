"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, ClipboardList, ExternalLink, Inbox, LayoutGrid, Library, LogOut, MessageSquare, MessageSquareText, PenTool, Shield, UserCog, Users, Wallet, type LucideIcon } from "lucide-react";
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
//
// Grouped by task and audience (docs/decisions/0208): Inbox, then Content and
// Students for every Studio user, Admin for admins only, then Guide and the
// way back to the site. An entry that only some users have belongs in its own section or
// on its parent's page, never appended to the shared list.

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Active on the exact path only (/studio itself would match every page). */
  exact?: boolean;
  /** Further path prefixes that count as this entry (0208 Decisions 2-3). */
  match?: string[];
  /** Leaves Studio: a trailing arrow, never shown as active. */
  external?: boolean;
};

type BadgeFor = (href: string) => { count: number | null; label: string } | null;

const inboxItem: NavItem = { label: "Inbox", href: "/studio", icon: Inbox, exact: true };

const studentItems: NavItem[] = [
  { label: "Learners", href: "/studio/learners", icon: Users },
  { label: "Homework", href: "/studio/homework", icon: ClipboardList },
  { label: "Messages", href: "/studio/messages", icon: MessageSquare },
  { label: "Calendar", href: "/studio/calendar", icon: CalendarDays },
];

// Admin only: each page 404s for anyone else (TCH-007, TCH-010, OPS-032).
// /app/admin has no index page of its own; the review queue is the first entry
// of AppSidebar's Admin section that stays in Colloquiz.
const adminItems: NavItem[] = [
  { label: "Authors", href: "/studio/authors", icon: UserCog },
  { label: "Catalogue", href: "/studio/catalogue", icon: LayoutGrid },
  { label: "Costs", href: "/studio/costs", icon: Wallet },
  { label: "Colloquiz admin", href: "/app/admin/review", icon: Shield, external: true },
];

// The Guide (TCH-015, docs/decisions/0206 Decision 10) and the way back to the site.
const closingItems: NavItem[] = [
  { label: "Guide", href: "/studio/guide", icon: BookOpen },
  { label: "View site", href: "/", icon: ExternalLink, external: true },
];

function isActive(item: NavItem, pathname: string): boolean {
  if (item.external) return false;
  const prefixes = [item.href, ...(item.match ?? [])];
  return prefixes.some((p) => pathname === p || (!item.exact && pathname.startsWith(p + "/")));
}

function NavLink({
  item,
  active,
  badge,
  badgeLabel,
}: {
  item: NavItem;
  active: boolean;
  badge?: number | null;
  badgeLabel?: string;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
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
      {/* Leaves Studio; "View site" already carries the arrow as its icon. */}
      {item.external && item.icon !== ExternalLink && (
        <ExternalLink size={14} className="shrink-0 text-muted-foreground" aria-hidden />
      )}
      {/* AppSidebar's duels badge, same classes (AUTH-012). */}
      {badge != null && badge > 0 && (
        <span
          className="shrink-0 min-w-5 h-5 px-1.5 flex items-center justify-center rounded-full bg-brand text-white text-[11px] font-medium leading-none"
          aria-label={`${badge} ${badgeLabel ?? "waiting for feedback"}`}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

function NavSection({
  label,
  items,
  pathname,
  badgeFor,
}: {
  label?: string;
  items: NavItem[];
  pathname: string;
  badgeFor: BadgeFor;
}) {
  return (
    <div>
      {label && <p className="text-xs text-muted-foreground font-medium tracking-wider px-3 mb-2">{label}</p>}
      <nav className="flex flex-col gap-1" aria-label={label}>
        {items.map((item) => {
          const badge = badgeFor(item.href);
          return (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(item, pathname)}
              badge={badge?.count}
              badgeLabel={badge?.label}
            />
          );
        })}
      </nav>
    </div>
  );
}

export function StudioSidebar({
  isAdmin,
  waitingCount,
  unansweredCount,
}: {
  isAdmin: boolean;
  /** review_queue's waiting takes (AUTH-012); null hides the badge. */
  waitingCount: number | null;
  /** Threads whose last message is the student's (TCH-004); null hides it. */
  unansweredCount: number | null;
}) {
  const pathname = usePathname();

  // Recordings is the review queue and the AI feedback list under one entry
  // (0208 Decision 2). It opens the queue while something waits for feedback,
  // else the AI list, which covers every course, self-paced ones too.
  const contentItems: NavItem[] = [
    // Imports live on the Courses page (0208 Decision 3).
    { label: "Courses", href: "/studio/courses", icon: Library, match: ["/studio/imports"] },
    {
      label: "Recordings",
      href: waitingCount != null && waitingCount > 0 ? "/studio/reviews" : "/studio/voice",
      icon: MessageSquareText,
      match: ["/studio/reviews", "/studio/voice"],
    },
  ];

  // Each count sits on the entry where the work is done (0208 Decision 5).
  const badgeFor: BadgeFor = (href) => {
    if (href === "/studio/reviews" || href === "/studio/voice") return { count: waitingCount, label: "waiting for feedback" };
    if (href === "/studio/messages") return { count: unansweredCount, label: "unanswered" };
    return null;
  };

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

      <SidebarContent className="px-3 py-4 gap-4">
        <NavSection items={[inboxItem]} pathname={pathname} badgeFor={badgeFor} />
        <NavSection label="Content" items={contentItems} pathname={pathname} badgeFor={badgeFor} />
        <NavSection label="Students" items={studentItems} pathname={pathname} badgeFor={badgeFor} />
        {isAdmin && <NavSection label="Admin" items={adminItems} pathname={pathname} badgeFor={badgeFor} />}
        {/* Last in the scrolling list, not in the footer: three footer rows ate
            a phone sheet's height and pushed Admin below the fold (0208). */}
        <NavSection items={closingItems} pathname={pathname} badgeFor={badgeFor} />
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
