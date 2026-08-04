"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import {
  BookOpen,
  ChevronDown,
  GraduationCap,
  Library,
  LogOut,
  Medal,
  MessageSquare,
  Pencil,
  PenLine,
  Settings,
  Settings2,
  Shield,
  ShieldCheck,
  Swords,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { COURSES_ENABLED } from "@/lib/featureFlags";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/app/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";

type NavItem = {
  label: string;
  description?: string;
  href: string;
  icon: LucideIcon;
};

// Descriptions are intentionally sparse: only the two items whose purpose isn't
// obvious from the label keep a subtitle. Achievements rides in My learning for
// now — a later change merges it with Dashboard.
const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: "Play",
    items: [
      { label: "Quick Play", href: "/", icon: BookOpen },
      { label: "Deep Dive", description: "Mix subjects, set length", href: "/advanced", icon: Settings2 },
    ],
  },
  {
    label: "My learning",
    items: [
      { label: "Courses", description: "Structured, stage by stage", href: "/courses", icon: Library },
      { label: "My Quizzes", href: "/my-quizzes", icon: GraduationCap },
      { label: "Groups", href: "/groups", icon: Users },
      { label: "Progress", href: "/progress", icon: TrendingUp },
    ],
  },
  {
    label: "Compete",
    items: [
      { label: "Duels", description: "1v1 challenges", href: "/duels", icon: Swords },
      { label: "Leaderboard", href: "/leaderboard", icon: Medal },
    ],
  },
];

// The tutor/author flow is dormant while Groups is the active collaboration
// surface. The routes, RLS and data layer are all intact — only the nav entry
// points are hidden, so restoring the flow is this one flag.
const SHOW_AUTHOR_NAV = false;

const authorItems = [
  {
    label: "Quiz Builder",
    description: "Create a private quiz",
    href: "/my-quizzes/builder",
    icon: PenLine,
  },
  {
    label: "Students",
    description: "Invite & assign",
    href: "/students",
    icon: Users,
  },
];

const adminItems: NavItem[] = [
  {
    label: "Quiz Builder",
    href: "/admin/quiz-builder",
    icon: Shield,
  },
  {
    label: "Review Queue",
    href: "/admin/review",
    icon: ShieldCheck,
  },
  {
    label: "Courses",
    href: "/admin/courses",
    icon: Pencil,
  },
  {
    label: "Feedback",
    href: "/admin/feedback",
    icon: MessageSquare,
  },
];

// Editors (non-admin course_editors) get a lone entry into the authoring surface.
// Same href as the admin item — the page decides what to show — but a separate
// section so a non-admin never sees a nav labelled "Admin".
const editorItems: NavItem[] = [
  {
    label: "Courses",
    href: "/admin/courses",
    icon: Pencil,
  },
];

export type UserProfile = {
  displayName: string;
  xp: number;
  level: number;
  /** XP remaining to reach the next level (from getLevelProgress). */
  xpToNext: number;
  /** Progress toward the next level, 0–100 (from getLevelProgress). */
  progress: number;
  /** Uploaded avatar, or null to fall back to initials. */
  avatarUrl?: string | null;
};

function UserXPCard({ profile, onSignOut }: { profile: UserProfile; onSignOut: () => void }) {
  const initials = profile.displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const firstName = profile.displayName.split(" ")[0] || profile.displayName;
  const pct = Math.min(100, Math.max(0, profile.progress));

  // Progress ring geometry for the collapsed rail. The ring hugs the 36px
  // (w-9) avatar; -inset-[3px] grows the SVG box to 42px so a 3px stroke sits
  // just outside the avatar edge.
  const R = 19.5;
  const CIRC = 2 * Math.PI * R;

  // Radix restores focus to the trigger when the menu closes, and the browser
  // carries :focus-visible over from the menu content — so dismissing with a
  // click left a keyboard focus ring stuck on the card. Skip the restore only
  // for pointer dismissals; Escape and item selection keep it.
  const dismissedByPointer = useRef(false);

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) dismissedByPointer.current = false;
      }}
    >
      <DropdownMenuTrigger
        aria-label="Account menu"
        // The trigger is excluded from onPointerDownOutside, so clicking it to
        // close needs its own flag. Reopening resets it via onOpenChange.
        onPointerDown={() => {
          dismissedByPointer.current = true;
        }}
        className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-accent transition-colors cursor-pointer outline-hidden focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center"
      >
        <div className="relative shrink-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand to-brand-accent flex items-center justify-center text-white text-sm font-medium select-none overflow-hidden">
            {profile.avatarUrl
              ? <Image src={profile.avatarUrl} alt="" width={36} height={36} className="w-full h-full object-cover" />
              : initials}
          </div>
          {/* Progress ring — collapsed rail only (bar replaces it when expanded) */}
          <svg
            className="absolute -inset-[3px] hidden -rotate-90 group-data-[collapsible=icon]:block"
            viewBox="0 0 42 42"
            aria-hidden
          >
            <circle cx="21" cy="21" r={R} fill="none" strokeWidth="3" className="stroke-muted" />
            <circle
              cx="21"
              cy="21"
              r={R}
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              className="stroke-brand"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - pct / 100)}
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0 text-left group-data-[collapsible=icon]:hidden">
          <p className="text-sm font-medium text-sidebar-foreground leading-none">
            {firstName}
          </p>
          {/* Progress bar toward next level */}
          <div className="mt-1.5 h-[3px] w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand to-brand-accent"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Level {profile.level} · {profile.xpToNext} XP to level {profile.level + 1}
          </p>
        </div>
        <ChevronDown
          size={14}
          className="text-muted-foreground shrink-0 group-data-[collapsible=icon]:hidden"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className="w-56"
        onPointerDownOutside={() => {
          dismissedByPointer.current = true;
        }}
        onCloseAutoFocus={(event) => {
          if (dismissedByPointer.current) event.preventDefault();
        }}
      >
        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer">
            <Settings size={16} />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={onSignOut}
          className="cursor-pointer"
        >
          <LogOut size={16} />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppSidebar({
  profile,
  isAdmin,
  isAuthor,
  isCourseEditor = false,
  duelCount = 0,
}: {
  profile: UserProfile;
  isAdmin: boolean;
  isAuthor: boolean;
  /** True when the caller has at least one course_editors row (and isn't an admin). */
  isCourseEditor?: boolean;
  /** Duels awaiting this user's move — shown as a badge on the Duels entry. */
  duelCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const renderNavLink = ({ label, description, href, icon: Icon }: NavItem) => {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    const badge = href === "/duels" && duelCount > 0 ? duelCount : null;
    return (
      <Link
        key={href}
        href={href}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
          active
            ? "bg-brand-subtle text-brand-text"
            : "text-foreground hover:bg-accent",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center w-8 h-8 rounded-lg transition-all shrink-0",
            active
              ? "bg-brand text-white"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
          <p className="text-sm font-medium leading-none truncate">{label}</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
          )}
        </div>
        {badge !== null && (
          <span className="shrink-0 min-w-5 h-5 px-1.5 flex items-center justify-center rounded-full bg-brand text-white text-[11px] font-medium leading-none group-data-[collapsible=icon]:hidden">
            {badge}
          </span>
        )}
        {active && !badge && (
          <div className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 group-data-[collapsible=icon]:hidden" />
        )}
      </Link>
    );
  };

  return (
    <Sidebar collapsible="icon">
      {/* Logo */}
      <SidebarHeader className="px-4 py-4 border-b border-sidebar-border group-data-[collapsible=icon]:px-2">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand to-brand-accent shrink-0">
            <GraduationCap size={18} className="text-white" />
          </div>
          <div className="min-w-0 overflow-hidden group-data-[collapsible=icon]:hidden">
            <p className="font-semibold text-sidebar-foreground leading-none truncate">Colloquiz</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">Knowledge Platform</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4 group-data-[collapsible=icon]:px-2">
        {navSections.map((section, i) => (
          <div key={section.label} className={i === 0 ? undefined : "mt-4"}>
            <p className="text-xs text-muted-foreground font-medium tracking-wider px-3 mb-2 group-data-[collapsible=icon]:hidden">
              {section.label}
            </p>
            <nav className="flex flex-col gap-1">
              {section.items
                // Courses is dormant until released — see lib/featureFlags.ts.
                .filter((item) => COURSES_ENABLED || item.href !== "/courses")
                .map(renderNavLink)}
            </nav>
          </div>
        ))}

        {/* Author */}
        {SHOW_AUTHOR_NAV && isAuthor && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider px-3 mb-2 group-data-[collapsible=icon]:hidden">
              Author
            </p>
            <nav className="flex flex-col gap-1">
              {authorItems.map(({ label, description, href, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
                      active
                        ? "bg-brand-subtle text-brand-text"
                        : "text-foreground hover:bg-accent",
                    )}
                  >
                    <div
                      className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-lg transition-all shrink-0",
                        active
                          ? "bg-brand text-white"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                      <p className="text-sm font-medium leading-none truncate">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
                    </div>
                    {active && (
                      <div className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 group-data-[collapsible=icon]:hidden" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}

        {/* Admin */}
        {isAdmin && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground font-medium tracking-wider px-3 mb-2 group-data-[collapsible=icon]:hidden">
              Admin
            </p>
            <nav className="flex flex-col gap-1">
              {adminItems.map(renderNavLink)}
            </nav>
          </div>
        )}

        {/* Editor — only for non-admin users who hold at least one
            course_editors grant. Admins get the same link via the Admin
            section above; showing both would double the entry. */}
        {!isAdmin && isCourseEditor && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground font-medium tracking-wider px-3 mb-2 group-data-[collapsible=icon]:hidden">
              Editing
            </p>
            <nav className="flex flex-col gap-1">
              {editorItems.map(renderNavLink)}
            </nav>
          </div>
        )}

      </SidebarContent>

      <SidebarFooter className="px-3 py-4 border-t border-sidebar-border group-data-[collapsible=icon]:px-2">
        <UserXPCard profile={profile} onSignOut={handleSignOut} />
      </SidebarFooter>
    </Sidebar>
  );
}
