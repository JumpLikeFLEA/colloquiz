import { LogOut, UserRound } from "lucide-react";
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
 * The band is `overflow-hidden` with no transform, so the `fixed` layer
 * still covers the viewport, and the card is tall enough to fit inside even
 * the compact lesson band. The card uses the popover tokens, not the
 * band's translucent white: it has to be readable over the gradient and
 * over the page content alike.
 */
export function AccountMenu({ email, lang, next }: { email: string | null; lang: SurfaceLang; next: string }) {
  const a = accountCopy[lang];
  const initial = accountInitial(email);
  const status = email ? `${a.signedInAs} ${email}` : a.signedIn;

  return (
    <details className="group relative z-30">
      <summary
        aria-label={status}
        title={status}
        className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white group-open:before:fixed group-open:before:inset-0 group-open:before:cursor-default group-open:before:content-[''] [&::-webkit-details-marker]:hidden"
      >
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-full bg-white text-sm font-semibold text-brand-deep shadow-sm ring-2 ring-white/30 transition-shadow group-hover:ring-white/60"
        >
          {initial ?? <UserRound className="size-4" />}
        </span>
      </summary>
      <div className="absolute right-0 top-full z-10 mt-2 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg">
        {email ? (
          <p className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{a.signedInAs}</span>
            <span className="truncate text-sm font-medium">{email}</span>
          </p>
        ) : (
          <p className="text-sm font-medium">{a.signedIn}</p>
        )}
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
