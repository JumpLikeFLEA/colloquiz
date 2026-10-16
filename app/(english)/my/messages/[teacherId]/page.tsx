import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { authUserFrom } from "@/lib/auth";
import { parseSurfaceLang, SURFACE_LANG_COOKIE } from "@/lib/alliengll/surfaceLang";
import { createClient } from "@/lib/supabase/server";
import { getSignedInAccount } from "@/lib/signedInAccount";
import { getConversationMessages, getThreads, markConversationRead } from "@/lib/messages/messagesServer";
import { PEER_ID_PATTERN } from "@/lib/messages/messages";
// Direct paths, not the lesson-player barrel (docs/decisions/0059).
import { LESSON_HEADER_COLUMN_CLASS } from "@/app/components/lesson-player/columnLayout";
import { MessageComposer } from "@/app/components/messages/MessageComposer";
import { MessageThread } from "@/app/components/messages/MessageThread";
import { AccountMenu } from "../../../AccountMenu";
import { BandTopBar } from "../../../BandTopBar";
import { GradientBackdrop } from "../../../HeroDecor";
import { GLASS_PILL_CLASS, GRADIENT_BAND_CLASS, HERO_ENTER_CLASS } from "../../../surfaceClasses";
import { messagesCopy } from "../messagesCopy";

export async function generateMetadata(): Promise<Metadata> {
  const lang = parseSurfaceLang((await cookies()).get(SURFACE_LANG_COOKIE)?.value);
  return { title: messagesCopy[lang].metaTitle, robots: { index: false } };
}

/**
 * TCH-004 (docs/decisions/0151) — one conversation, as the STUDENT, keyed by
 * the teacher's profile id. The thread and its open/closed state come from
 * `message_threads('student')` and `conversation_messages` (079); a teacher id
 * that is neither linked nor in a conversation with the caller is a 404, the
 * same answer as an id that does not exist.
 *
 * Order matters: the messages are read first (so "New" can be shown), then the
 * thread is marked read, and only THEN is getSignedInAccount first called,
 * because it caches the unread count for the account chip's dot for the rest
 * of the request (lib/signedInAccount.ts).
 */
export default async function MyMessageThreadPage({ params }: { params: Promise<{ teacherId: string }> }) {
  const { teacherId } = await params;
  if (!PEER_ID_PATTERN.test(teacherId)) notFound();

  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) redirect(`/login?${new URLSearchParams({ next: `/my/messages/${teacherId}` }).toString()}`);

  const [threads, messages, langCookie] = await Promise.all([
    getThreads("student"),
    getConversationMessages(teacherId, user.id),
    cookies(),
  ]);
  const thread = threads.find((t) => t.peerId === teacherId);
  if (!thread) notFound();

  if (messages.some((msg) => !msg.read)) await markConversationRead(teacherId, user.id);
  const signedIn = await getSignedInAccount();

  const lang = parseSurfaceLang(langCookie.get(SURFACE_LANG_COOKIE)?.value);
  const m = messagesCopy[lang];

  return (
    <main className="bg-background">
      <section className={GRADIENT_BAND_CLASS}>
        <GradientBackdrop />
        <div className={`${LESSON_HEADER_COLUMN_CLASS} relative flex flex-col gap-8 pb-10 pt-5 sm:pb-12 lg:pt-6`}>
          <BandTopBar
            back={{ href: "/my/messages", label: m.backToList }}
            account={
              signedIn && (
                <AccountMenu email={signedIn.email} studio={signedIn.isEditor} unread={signedIn.unreadMessages} lang={lang} next="/" />
              )
            }
          />
          <div className={`${HERO_ENTER_CLASS} flex flex-col items-start gap-3`}>
            <span className={GLASS_PILL_CLASS}>{m.title}</span>
            <h1 className="text-balance break-words text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              {thread.peerLabel}
            </h1>
            <p className="max-w-xl text-base text-white/80 sm:text-lg">{m.privateNote(thread.peerLabel)}</p>
          </div>
        </div>
      </section>

      <div className={`${LESSON_HEADER_COLUMN_CLASS} flex w-full flex-col gap-8 py-12 sm:py-16`}>
        {messages.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {m.noMessages}
          </p>
        ) : (
          <MessageThread
            messages={messages}
            locale={lang === "ru" ? "ru-RU" : "en-GB"}
            labels={{
              you: m.you,
              them: thread.peerLabel,
              newMessage: m.newMessage,
              unreadable: m.unreadable,
              attachment: m.attachment,
              attachmentUnreadable: m.attachmentUnreadable,
            }}
          />
        )}

        {thread.isOpen ? (
          <MessageComposer teacherId={teacherId} studentId={user.id} labels={m.composer} />
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            {m.closedNote(thread.peerLabel)}
          </p>
        )}
      </div>
    </main>
  );
}
