import Link from "next/link";
import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import { myTabsCopy } from "./myTabsCopy";

export type MyTab = "overview" | "notebook" | "messages" | "settings";

const TABS: { tab: MyTab; href: string }[] = [
  { tab: "overview", href: "/my" },
  { tab: "notebook", href: "/my/notebook" },
  { tab: "messages", href: "/my/messages" },
  { tab: "settings", href: "/my/settings" },
];

/**
 * One row of tabs across the personal area (SHELL-039, docs/decisions/0251):
 * Overview, Notebook, Messages, Settings. A Server Component with plain links,
 * zero client JS.
 *
 * The look is a boxed rail (OUTLINE_CTA_CLASS's ink frame around the
 * Appearance rail's `p-1 gap-1`), with the current segment filled in ink
 * (`bg-foreground text-background`, AchievementsView's precedent). Not violet:
 * a violet-filled rail is LanguageToggle's look, and the area nav must not
 * read as a switch (0251 Decision 2). Below `sm` the labels drop to `text-xs`
 * so four Russian tabs fit at 360px.
 *
 * Messages shows when the learner has a thread or a linked teacher (`show`),
 * when a reply is unread, and always on the Messages pages themselves.
 *
 * `prefetch={false}` like the notebook's own tabs (NotebookSections.tsx): each
 * tab is a page with its own server reads, and a view of one tab should not
 * run the others' (0251 Decision 4).
 */
export function MyTabs({
  current,
  lang,
  messages,
}: {
  current: MyTab;
  lang: SurfaceLang;
  messages: { show: boolean; unread: number };
}) {
  const t = myTabsCopy[lang];
  const showMessages = current === "messages" || messages.show || messages.unread > 0;
  const tabs = TABS.filter(({ tab }) => tab !== "messages" || showMessages);
  return (
    <nav aria-label={t.label} data-my-tabs>
      <ul className="flex gap-1 rounded-xl border-2 border-ink bg-card p-1">
        {tabs.map(({ tab, href }) => {
          const on = tab === current;
          const label = tab === "messages" && messages.unread > 0 ? `${t.messages} (${messages.unread})` : t[tab];
          return (
            <li key={tab} className="flex min-w-0 flex-auto">
              <Link
                href={href}
                prefetch={false}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-lg px-2 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand sm:px-4 sm:text-sm ${
                  on ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
