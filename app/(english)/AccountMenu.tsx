import { BookOpen, LogOut, MessageSquare, PenTool, Settings, UserRound } from "lucide-react";
import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import { accountInitial } from "@/lib/accountInitial";
import { accountCopy } from "./accountCopy";

/**
 * The signed-in learner's account chip (SHELL-019, docs/decisions/0086): a
 * white circle with their email's initial, in the gradient band's top bar
 * where a signed-out visitor on `/` sees "Log in". Tapping it opens a small
 * card with "Signed in as <email>" and "Sign out".
 *
 * Zero client JS, on purpose: `/` has ~2 KB of its 180 KB budget left
 * (0086 Budget), and this renders on every English page.
 * - The open/close state is a native `<details>`. While it is open, the
 *   summary's `::before` becomes a transparent full-viewport layer, so a tap
 *   anywhere outside the card lands on the summary and closes it. There is
 *   no Escape handling; the summary itself toggles it from the keyboard.
 * - Sign-out is a plain form POST to /auth/sign-out (app/auth/sign-out/
 *   route.ts), which 303s back to `next`, the page this menu is on.
 *
 * An account with no email (Telegram sign-in, docs/decisions/0098) shows its
 * username instead (SHELL-024): the chip its first letter, the card "Signed
 * in as @username". The username comes from the JWT (lib/auth.ts), a prop
 * like `email`, so this stays a Server Component with zero client JS.
 *
 * An editor (`studio`, from getSignedInAccount's `isEditor`) also gets a
 * "Studio" link to /studio above Sign out (SHELL-021, docs/decisions/0109
 * Decision 4); a learner sees nothing new. A plain `<a>`, not next/link:
 * Studio is another root layout, so the navigation is a full load anyway.
 *
 * Every signed-in user also gets "My courses", a link to the learner home
 * at /my (PROG-002, docs/decisions/0120), first in the card. Also a plain
 * `<a>`: no client JS, and nothing here needs a soft navigation.
 *
 * Every signed-in user also gets "Settings", a link to /my/settings just above
 * Sign out (docs/decisions/0181): the theme, sign-in methods, export and
 * account deletion, without leaving this surface.
 *
 * While a teacher's reply is unread (TCH-004, docs/decisions/0151) the chip
 * carries a dot and the card a "Messages (N)" link to /my/messages. Both are
 * server markup from the `unread` prop; the count is read in
 * getSignedInAccount, fail-soft, so it adds no client JS and no way for the
 * chrome to break a page.
 *
 * The card may hang below the top bar onto the page: with My courses and
 * Studio it is taller than the compact bands, and a container that clipped
 * both axes cut it off (the gradient band, which clipped only horizontally,
 * until SHELL-033, docs/decisions/0192, moved the last pages to the paper).
 * The card uses the popover tokens, not the band's translucent white: it
 * has to be readable over the gradient and over the page content alike.
 */
export function AccountMenu({
  email,
  username = null,
  lang,
  next,
  studio,
  unread = 0,
}: {
  email: string | null;
  /** Telegram username (no "@") for an account with no email (SHELL-024). */
  username?: string | null;
  lang: SurfaceLang;
  next: string;
  studio: boolean;
  /** Unread teacher replies; 0 shows nothing. */
  unread?: number;
}) {
  const a = accountCopy[lang];
  // An email account shows its email; an account with none shows its Telegram
  // username as "@name" (SHELL-024); with neither, the generic icon and copy.
  const who = email ?? (username ? `@${username}` : null);
  const initial = accountInitial(email ?? username);
  const base = who ? `${a.signedInAs} ${who}` : a.signedIn;
  const status = unread > 0 ? `${base}. ${a.unreadLabel} ${unread}` : base;

  return (
    <details className="group relative z-30">
      <summary
        aria-label={status}
        title={status}
        className={`relative flex size-11 cursor-pointer list-none items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand group-open:before:fixed group-open:before:inset-0 group-open:before:cursor-default group-open:before:content-[''] [&::-webkit-details-marker]:hidden`}
      >
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-full text-sm font-semibold bg-brand text-white shadow-sm ring-2 ring-border transition-shadow group-hover:ring-brand/40"
        >
          {initial ?? <UserRound className="size-4" />}
        </span>
        {unread > 0 && (
          <span
            aria-hidden="true"
            data-unread-dot
            className="absolute right-0.5 top-0.5 size-3 rounded-full bg-destructive ring-2 ring-background"
          />
        )}
      </summary>
      <div className="absolute right-0 top-full z-10 mt-2 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg">
        {who ? (
          <p className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{a.signedInAs}</span>
            <span className="truncate text-sm font-medium">{who}</span>
          </p>
        ) : (
          <p className="text-sm font-medium">{a.signedIn}</p>
        )}
        <a
          href="/my"
          className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-subtle px-4 py-2.5 text-sm font-medium text-brand-text outline-none transition-colors hover:bg-brand-subtle-hover focus-visible:ring-2 focus-visible:ring-brand"
        >
          <BookOpen className="size-4" aria-hidden="true" />
          {a.myCourses}
        </a>
        {unread > 0 && (
          // A plain <a> like its neighbours (zero client JS, see above). The
          // no-html-link-for-pages rule began flagging this href when
          // /my/messages/[teacherId] was added (TCH-004); the /my and /studio
          // anchors above were not flagged. Cause not investigated.
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a
            href="/my/messages"
            className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-subtle px-4 py-2.5 text-sm font-medium text-brand-text outline-none transition-colors hover:bg-brand-subtle-hover focus-visible:ring-2 focus-visible:ring-brand"
          >
            <MessageSquare className="size-4" aria-hidden="true" />
            {a.messages} ({unread})
          </a>
        )}
        {studio && (
          <a
            href="/studio"
            className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-subtle px-4 py-2.5 text-sm font-medium text-brand-text outline-none transition-colors hover:bg-brand-subtle-hover focus-visible:ring-2 focus-visible:ring-brand"
          >
            <PenTool className="size-4" aria-hidden="true" />
            {a.studio}
          </a>
        )}
        {/* Every signed-in user (docs/decisions/0181 Decision 7): the
            English settings page, not /app/settings, so the footer stays the
            only path to Colloquiz (0062). */}
        <a
          href="/my/settings"
          className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-subtle px-4 py-2.5 text-sm font-medium text-brand-text outline-none transition-colors hover:bg-brand-subtle-hover focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Settings className="size-4" aria-hidden="true" />
          {a.settings}
        </a>
        <form method="post" action="/auth/sign-out">
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-subtle px-4 py-2.5 text-sm font-medium text-brand-text outline-none transition-colors hover:bg-brand-subtle-hover focus-visible:ring-2 focus-visible:ring-brand"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {a.signOut}
          </button>
        </form>
      </div>
    </details>
  );
}
