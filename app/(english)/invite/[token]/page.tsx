import type { Metadata } from "next";
import Link from "next/link";
import { getSignedInAccount } from "@/lib/signedInAccount";
import { invitePath, type InvitePreview } from "@/lib/runInvites";
import { getInvitePreview } from "@/lib/runInvitesServer";
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
  PAPER_PILL_CLASS,
  PAPER_PILL_HIGHLIGHT_CLASS,
} from "../../surfaceClasses";
import { inviteCopy } from "./inviteCopy";

// The title and description a link preview shows (docs/decisions/0137).
// The same for every state but not_found, for the reason the share card is
// (./opengraph-image.tsx): the preview is cached per URL.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const preview = await getInvitePreview(token);
  if (preview.state === "not_found") return { title: inviteCopy.metaTitle };
  return {
    title: inviteCopy.metaTitleFor(preview.courseTitle),
    description: inviteCopy.metaDescriptionFor(preview.courseTitle),
  };
}

/**
 * COH-003 (docs/decisions/0107) — where an invite link lands. English, no
 * toggle. Every state comes from `run_invite_preview` (059); this page only
 * picks the copy and the one action that state allows:
 *
 *   pending, signed out          → sign in / create an account, `next` = here
 *                                  (every sign-in path returns, ANON-016)
 *   pending, signed in           → "Join the course": a form POST to
 *                                  /api/invites/claim, which 303s to the
 *                                  course page. A button, not a claim on GET,
 *                                  so a link preview can't spend the invite
 *                                  and the learner sees which account joins
 *   pending, already in the run  → link to the course; the invite stays unspent
 *   claimed_by_you               → link to the course
 *   used / expired / revoked     → a page each, with what to do next
 *   not_found                    → a page, with a way home
 *
 * The contact label is never shown here: the preview never returns it.
 * A Server Component with no client JS of its own; the layout's and
 * `next/link`'s are all the route ships.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [preview, signedIn] = await Promise.all([getInvitePreview(token), getSignedInAccount()]);
  const here = invitePath(token);

  return (
    // The Alina Cher grid paper (SHELL-033, docs/decisions/0192), as the lesson page's own states.
    <main className="grid-paper flex flex-1 flex-col" data-invite-state={preview.state}>
      <section>
        <div className={`${LESSON_READING_FRAME_CLASS} relative flex flex-col gap-8 pb-8 pt-5 sm:pb-10 lg:pt-6`}>
          <BandTopBar tone="paper" account={signedIn && <AccountMenu email={signedIn.email} username={signedIn.username} studio={signedIn.isEditor} unread={signedIn.unreadMessages} lang="en" next={here} tone="paper" />} />
          <div className={`${HERO_ENTER_CLASS} flex flex-col items-start gap-3`}>
            <span className={PAPER_PILL_HIGHLIGHT_CLASS}>{inviteCopy.eyebrow}</span>
            {preview.state === "not_found" ? (
              <h1 className="text-balance font-display text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
                {inviteCopy.notFound.title}
              </h1>
            ) : (
              <>
                <h1 className="text-balance font-display text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
                  {preview.courseTitle}
                </h1>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {preview.runTitle && <span className={PAPER_PILL_CLASS}>{preview.runTitle}</span>}
                  <span className={PAPER_PILL_CLASS}>{inviteCopy.tier[preview.tier]}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <div className={`${LESSON_READING_FRAME_CLASS} pb-10 pt-4 sm:pb-12`}>
        <section className={`${PAPER_PANEL_CLASS} flex flex-col items-center gap-4 px-6 py-10 text-center`}>
          <InviteState preview={preview} signedIn={signedIn} token={token} here={here} />
        </section>
      </div>
    </main>
  );
}

function InviteState({
  preview,
  signedIn,
  token,
  here,
}: {
  preview: InvitePreview;
  signedIn: { email: string | null } | null;
  token: string;
  here: string;
}) {
  if (preview.state === "not_found") {
    return (
      <>
        <Body>{inviteCopy.notFound.body}</Body>
        <Link href="/" className={OUTLINE_CTA_CLASS}>
          {inviteCopy.home}
        </Link>
      </>
    );
  }

  const courseLink = (
    <Link href={`/courses/${preview.courseSlug}`} className={OUTLINE_CTA_CLASS}>
      {inviteCopy.goToCourse}
    </Link>
  );

  if (preview.state === "pending") {
    if (!signedIn) {
      return (
        <>
          <Title>{inviteCopy.pending.title}</Title>
          {preview.teacherName && <LinkStatementCard lang="en" teacherName={preview.teacherName} />}
          <Body>{inviteCopy.pending.signedOutBody}</Body>
          <Link href={`/login?${new URLSearchParams({ next: here }).toString()}`} className={OFFSET_CTA_CLASS}>
            {inviteCopy.pending.signedOutCta}
          </Link>
        </>
      );
    }
    if (preview.alreadyEnrolled) {
      return (
        <>
          <Title>{inviteCopy.alreadyEnrolled.title}</Title>
          <Body>{inviteCopy.alreadyEnrolled.body}</Body>
          {courseLink}
        </>
      );
    }
    return (
      <>
        <Title>{inviteCopy.pending.title}</Title>
        {/* TCH-001: claiming also links the learner to the invite's creator
            (076), so the statement is shown before the button that does it. */}
        {preview.teacherName && <LinkStatementCard lang="en" teacherName={preview.teacherName} />}
        <Body>
          {signedIn.email ? (
            <>
              {inviteCopy.pending.joiningAs} <span className="font-medium text-foreground">{signedIn.email}</span>.
            </>
          ) : (
            inviteCopy.pending.joiningSignedIn
          )}
        </Body>
        <form action="/api/invites/claim" method="post">
          <input type="hidden" name="token" value={token} />
          <button type="submit" className={OFFSET_CTA_CLASS}>
            {inviteCopy.pending.join}
          </button>
        </form>
        <p className="max-w-sm text-xs text-muted-foreground">{inviteCopy.pending.otherAccount}</p>
      </>
    );
  }

  const copy = {
    claimed_by_you: inviteCopy.claimedByYou,
    used: inviteCopy.used,
    expired: inviteCopy.expired,
    revoked: inviteCopy.revoked,
  }[preview.state];

  return (
    <>
      <Title>{copy.title}</Title>
      <Body>{copy.body}</Body>
      {preview.state === "claimed_by_you" ? (
        courseLink
      ) : (
        <Link href="/" className={OUTLINE_CTA_CLASS}>
          {inviteCopy.home}
        </Link>
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
