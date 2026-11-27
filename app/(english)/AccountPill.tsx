import { UserRound } from "lucide-react";
import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import { accountInitial } from "@/lib/accountInitial";
import { accountWho } from "@/lib/accountWho";
import type { SignedInAccount } from "@/lib/signedInAccount";
import { accountCopy } from "./accountCopy";

/**
 * The signed-in learner's way into the personal area (SHELL-040,
 * docs/decisions/0252): a pill with the account's initial and a visible
 * label, "My learning" / "Кабинет", that links straight to /my. It replaced
 * the account chip and its `<details>` menu (SHELL-019, docs/decisions/0086),
 * whose items SHELL-039 (0251) moved onto the /my pages: the tabs reach the
 * notebook, messages and settings; Settings holds "Signed in as" and Sign
 * out; /my holds the Studio row for an editor.
 *
 * Zero client JS: a plain `<a>`, a Server Component, rendered on every
 * English page that has a signed-in learner. Not next/link, as the menu's
 * links were not: nothing here needs a soft navigation.
 *
 * - The initial is the email's (else the Telegram username's, SHELL-024);
 *   with neither, the person icon.
 * - The unread dot (TCH-004, docs/decisions/0151) stays on the circle while a
 *   teacher reply is unread. The accessible name is the label, plus "Unread
 *   messages: N" then; `title` keeps "Signed in as <who>".
 * - `current` (on /my itself) sets `aria-current="page"`.
 * - The frame is `min-h-11`, like the back link and the bar's other items, so
 *   the header row is no taller than it was. Below `sm` the circle, padding
 *   and gap are smaller (the label stays `text-sm`), which gives the landing's
 *   phone header room (0252); from `sm` up it is the full size.
 */
export function AccountPill({
  account,
  lang,
  current = false,
}: {
  account: SignedInAccount;
  lang: SurfaceLang;
  current?: boolean;
}) {
  const { email, username, unreadMessages: unread } = account;
  const a = accountCopy[lang];
  const who = accountWho({ email, username });
  const initial = accountInitial(email ?? username);
  const name = unread > 0 ? `${a.label}. ${a.unreadLabel} ${unread}` : a.label;

  return (
    <a
      href="/my"
      aria-label={name}
      aria-current={current ? "page" : undefined}
      title={who ? `${a.signedInAs} ${who}` : a.signedIn}
      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-ink bg-card py-0.5 pl-1 pr-2 text-sm sm:gap-2 sm:pl-0.5 sm:pr-3 font-semibold text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span aria-hidden="true" className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white sm:size-9 sm:text-sm">
        {initial ?? <UserRound className="size-4" />}
        {unread > 0 && (
          <span
            data-unread-dot
            className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-destructive ring-2 ring-card"
          />
        )}
      </span>
      <span aria-hidden="true">{a.label}</span>
    </a>
  );
}
