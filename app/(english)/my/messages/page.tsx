import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight, MessageSquare } from "lucide-react";
import { parseSurfaceLang, SURFACE_LANG_COOKIE } from "@/lib/alliengll/surfaceLang";
import { getSignedInAccount } from "@/lib/signedInAccount";
import { getThreads } from "@/lib/messages/messagesServer";
import { threadPath } from "@/lib/messages/messages";
// Direct path, not the lesson-player barrel (docs/decisions/0059).
import { LESSON_HEADER_COLUMN_CLASS } from "@/app/components/lesson-player/columnLayout";
import { AccountMenu } from "../../AccountMenu";
import { BandTopBar } from "../../BandTopBar";
import {
  HERO_ENTER_CLASS,
  PAPER_CARD_CLASS,
  PAPER_EMPTY_BOX_CLASS,
  PAPER_PILL_HIGHLIGHT_CLASS,
} from "../../surfaceClasses";
import { messagesCopy } from "./messagesCopy";

export async function generateMetadata(): Promise<Metadata> {
  const lang = parseSurfaceLang((await cookies()).get(SURFACE_LANG_COOKIE)?.value);
  return { title: messagesCopy[lang].metaTitle, robots: { index: false } };
}

const ICON_TILE_CLASS =
  "flex size-10 flex-none items-center justify-center rounded-xl border-2 border-ink bg-highlight text-highlight-foreground";
const NEW_PILL_CLASS = "inline-flex w-fit items-center rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-white";
const MUTED_PILL_CLASS = "inline-flex w-fit items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground";

/**
 * TCH-004 (docs/decisions/0151) — the learner's messages: one row per
 * teacher, a conversation or a linked teacher you have not written to yet.
 * Every row comes from `message_threads('student')` (079) under the learner's
 * own session; this page decides nothing about who may write. A Server
 * Component with no client JS of its own.
 *
 * Signed out: proxy.ts sends `/my/*` to /login?next=...; the redirect below is
 * the same rule for a session that lapses between the proxy and the page.
 */
export default async function MyMessagesPage() {
  const signedIn = await getSignedInAccount();
  if (!signedIn) redirect(`/login?${new URLSearchParams({ next: "/my/messages" }).toString()}`);

  const [threads, langCookie] = await Promise.all([getThreads("student"), cookies()]);
  const lang = parseSurfaceLang(langCookie.get(SURFACE_LANG_COOKIE)?.value);
  const m = messagesCopy[lang];

  return (
    // The Alina Cher grid paper (SHELL-033, docs/decisions/0192), as /my since PROG-007.
    <main className="grid-paper">
      <section>
        <div className={`${LESSON_HEADER_COLUMN_CLASS} relative flex flex-col gap-8 pb-8 pt-5 sm:pb-10 lg:pt-6`}>
          <BandTopBar
           
            back={{ href: "/my", label: m.backToMy }}
            account={<AccountMenu email={signedIn.email} username={signedIn.username} studio={signedIn.isEditor} unread={signedIn.unreadMessages} lang={lang} next="/" />}
          />
          <div className={`${HERO_ENTER_CLASS} flex flex-col items-start gap-3`}>
            <span className={PAPER_PILL_HIGHLIGHT_CLASS}>{m.eyebrow}</span>
            <h1 className="text-balance font-display text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">{m.title}</h1>
            <p className="max-w-xl text-base text-muted-foreground sm:text-lg">{m.lead}</p>
          </div>
        </div>
      </section>

      <div className={`${LESSON_HEADER_COLUMN_CLASS} flex w-full flex-col gap-3 pb-12 pt-4 sm:pb-16`}>
        {threads.length === 0 ? (
          <p className={`${PAPER_EMPTY_BOX_CLASS} p-6 text-center text-sm text-muted-foreground`}>
            {m.listEmpty}
          </p>
        ) : (
          <ul className="flex flex-col gap-3" data-messages="threads">
            {threads.map((t) => (
              <li key={t.peerId}>
                <Link href={threadPath("student", t.peerId)} className={`${PAPER_CARD_CLASS} flex items-center gap-3 p-4 sm:p-5`}>
                  <span className={ICON_TILE_CLASS}>
                    <MessageSquare className="size-4" aria-hidden="true" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    <p className="min-w-0 flex-1 break-words text-sm font-semibold text-foreground sm:text-base">
                      {t.peerLabel}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {t.unreadCount > 0 && <span className={NEW_PILL_CLASS}>{m.newCount(t.unreadCount)}</span>}
                      {!t.isOpen && <span className={MUTED_PILL_CLASS}>{m.closedPill}</span>}
                    </div>
                  </div>
                  <span className="flex flex-none items-center gap-1 text-xs font-medium text-brand-text">
                    {t.conversationId ? m.openConversation : m.startConversation}
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
