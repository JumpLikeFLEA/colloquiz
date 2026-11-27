import { LogOut } from "lucide-react";
import { accountWho } from "@/lib/accountWho";
import type { SignedInAccount } from "@/lib/signedInAccount";
import { SectionHeading } from "../../SectionHeading";
import { OUTLINE_CTA_CLASS, PAPER_PANEL_CLASS } from "../../surfaceClasses";
import type { AccountLabels } from "./settingsCopy";

/**
 * The first section of /my/settings (SHELL-039, docs/decisions/0251): who is
 * signed in, and Sign out. It is the account menu's card moved here, so the
 * menu can become a plain link to /my (SHELL-040). A Server Component, zero
 * client JS: sign-out is the same plain form POST to /auth/sign-out, with
 * next="/" because /my/settings would only bounce a signed-out visitor to
 * the sign-in page.
 */
export function AccountSection({ account, labels }: { account: SignedInAccount; labels: AccountLabels }) {
  const who = accountWho(account);
  return (
    <section className="flex flex-col gap-6" data-settings="account">
      <SectionHeading display title={labels.title} />
      <div className={`${PAPER_PANEL_CLASS} flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5`}>
        {who ? (
          <p className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{labels.signedInAs}</span>
            <span className="break-all text-sm font-medium text-foreground sm:text-base">{who}</span>
          </p>
        ) : (
          <p className="text-sm font-medium text-foreground">{labels.signedIn}</p>
        )}
        <form method="post" action="/auth/sign-out" className="flex-none">
          <input type="hidden" name="next" value="/" />
          <button type="submit" className={`${OUTLINE_CTA_CLASS} w-full cursor-pointer sm:w-auto`}>
            <LogOut className="size-4" aria-hidden="true" />
            {labels.signOut}
          </button>
        </form>
      </div>
    </section>
  );
}
