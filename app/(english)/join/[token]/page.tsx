import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { parseSurfaceLang, SURFACE_LANG_COOKIE } from "@/lib/alliengll/surfaceLang";
import { getSignedInAccount } from "@/lib/signedInAccount";
import { joinPath, type TeacherJoinPreview } from "@/lib/teacherLinks";
import { getTeacherJoinPreview } from "@/lib/teacherLinksServer";
// Direct paths, not the lesson-player barrel (docs/decisions/0059).
import { LESSON_READING_FRAME_CLASS } from "@/app/components/lesson-player/columnLayout";
import { AccountMenu } from "../../AccountMenu";
import { BandTopBar } from "../../BandTopBar";
import { LinkStatementCard } from "../../LinkStatementCard";
import {
  HERO_ENTER_CLASS,
  OFFSET_CTA_CLASS,
  OUTLINE_CTA_CLASS,
  PAPER_PANEL_CLASS,
  PAPER_PILL_HIGHLIGHT_CLASS,
} from "../../surfaceClasses";
import { joinCopy } from "./joinCopy";

// A teacher's link is private to whoever they send it to: no indexing, and a
// title that does not depend on the token's state (a link preview is cached
// per URL, the invite page's reasoning, docs/decisions/0137).
export async function generateMetadata(): Promise<Metadata> {
  const lang = parseSurfaceLang((await cookies()).get(SURFACE_LANG_COOKIE)?.value);
  return { title: joinCopy[lang].metaTitle, robots: { index: false } };
}

/**
 * TCH-001 (docs/decisions/0148) — where a teacher's student link lands.
 * Every state comes from `teacher_join_preview` (076); this page only picks
 * the copy and the one action that state allows, the invite page's shape
 * (docs/decisions/0107):
 *
 *   ok, signed out      -> the statement of what the teacher sees, then
 *                          sign in with `next` = here (every sign-in path
 *                          returns, ANON-016)
 *   ok, signed in       -> the statement and "Join": a form POST to
 *                          /api/teacher-links/join. A button, never a link
 *                          on GET, so a link preview can't link anyone and
 *                          the learner sees which account joins
 *   already_linked/self -> a page each, with where to go next
 *   not_found           -> an invalid or replaced token says so
 *
 * The teacher's only disclosed fact is their display name. Chrome follows
 * the saved EN/RU choice with no toggle of its own (the /my precedent). A
 * Server Component with no client JS of its own.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [preview, signedIn, cookieStore] = await Promise.all([
    getTeacherJoinPreview(token),
    getSignedInAccount(),
    cookies(),
  ]);
  const lang = parseSurfaceLang(cookieStore.get(SURFACE_LANG_COOKIE)?.value);
  const m = joinCopy[lang];
  const here = joinPath(token);

  return (
    // The Alina Cher grid paper (SHELL-033, docs/decisions/0192), as the invite page.
    <main className="grid-paper flex flex-1 flex-col" data-join-state={preview.state}>
      <section>
        <div className={`${LESSON_READING_FRAME_CLASS} relative flex flex-col gap-8 pb-8 pt-5 sm:pb-10 lg:pt-6`}>
          <BandTopBar
            tone="paper"
            account={signedIn && <AccountMenu email={signedIn.email} username={signedIn.username} studio={signedIn.isEditor} unread={signedIn.unreadMessages} lang={lang} next={here} tone="paper" />}
          />
          <div className={`${HERO_ENTER_CLASS} flex flex-col items-start gap-3`}>
            <span className={PAPER_PILL_HIGHLIGHT_CLASS}>{m.eyebrow}</span>
            <h1 className="text-balance font-display text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
              {preview.state === "not_found" ? m.notFound.title : m.headingFor(preview.teacherName)}
            </h1>
          </div>
        </div>
      </section>

      <div className={`${LESSON_READING_FRAME_CLASS} pb-10 pt-4 sm:pb-12`}>
        <section className={`${PAPER_PANEL_CLASS} flex flex-col items-center gap-4 px-6 py-10 text-center`}>
          <JoinState preview={preview} signedIn={signedIn} token={token} here={here} lang={lang} />
        </section>
      </div>
    </main>
  );
}

function JoinState({
  preview,
  signedIn,
  token,
  here,
  lang,
}: {
  preview: TeacherJoinPreview;
  signedIn: { email: string | null } | null;
  token: string;
  here: string;
  lang: "en" | "ru";
}) {
  const m = joinCopy[lang];

  if (preview.state === "not_found") {
    return (
      <>
        <Body>{m.notFound.body}</Body>
        <Link href="/" className={OUTLINE_CTA_CLASS}>
          {m.home}
        </Link>
      </>
    );
  }

  if (preview.state === "already_linked" || preview.state === "self") {
    const copy = preview.state === "self" ? m.self : m.alreadyLinked;
    return (
      <>
        <Title>{copy.title}</Title>
        <Body>{copy.body}</Body>
        <Link href={preview.state === "self" ? "/" : "/my"} className={OUTLINE_CTA_CLASS}>
          {preview.state === "self" ? m.home : m.myCourses}
        </Link>
      </>
    );
  }

  // ok
  return (
    <>
      <LinkStatementCard lang={lang} teacherName={preview.teacherName} />
      {!signedIn ? (
        <>
          <Body>{m.signedOutBody}</Body>
          <Link href={`/login?${new URLSearchParams({ next: here }).toString()}`} className={OFFSET_CTA_CLASS}>
            {m.signedOutCta}
          </Link>
        </>
      ) : (
        <>
          <Body>
            {signedIn.email ? (
              <>
                {m.joiningAs} <span className="font-medium text-foreground">{signedIn.email}</span>.
              </>
            ) : (
              m.joiningSignedIn
            )}
          </Body>
          <form action="/api/teacher-links/join" method="post">
            <input type="hidden" name="token" value={token} />
            <button type="submit" className={OFFSET_CTA_CLASS}>
              {m.join}
            </button>
          </form>
          <p className="max-w-sm text-xs text-muted-foreground">{m.otherAccount}</p>
        </>
      )}
    </>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-lg font-extrabold text-foreground">{children}</h2>;
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="max-w-sm text-sm text-muted-foreground sm:text-base">{children}</p>;
}
