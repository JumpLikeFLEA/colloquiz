import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { parseSurfaceLang, SURFACE_LANG_COOKIE } from "@/lib/alliengll/surfaceLang";
import { NOTEBOOK_PATH } from "@/lib/notebook/href";
import { getNotebookView } from "@/lib/notebookData";
import { getSignedInAccount } from "@/lib/signedInAccount";
// Direct path, not the lesson-player barrel (docs/decisions/0059).
import { LESSON_HEADER_COLUMN_CLASS } from "@/app/components/lesson-player/columnLayout";
import { AccountMenu } from "../../AccountMenu";
import { BandTopBar } from "../../BandTopBar";
import { HERO_ENTER_CLASS, PAPER_PILL_HIGHLIGHT_CLASS } from "../../surfaceClasses";
import { AddNote, EmptyNotebook, ListSection, RecordingsSection, RecordRow, SummarySection } from "./NotebookSections";
import { notebookCopy } from "./notebookCopy";

export async function generateMetadata(): Promise<Metadata> {
  const lang = parseSurfaceLang((await cookies()).get(SURFACE_LANG_COOKIE)?.value);
  return { title: notebookCopy[lang].metaTitle, robots: { index: false } };
}

/**
 * PROG-014 (docs/decisions/0235, 0240) — the learner notebook: what they can say and what they have
 * saved. `?tab=` and `?course=` are allow-listed in lib/notebook, so the filters cost no client JS.
 *
 * Signed out: proxy.ts sends `/my/*` to /login?next=...; the redirect below is the same rule for a
 * session that lapses between the proxy and the page.
 */
export default async function NotebookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tab, course } = await searchParams;
  const [view, signedIn, cookieStore] = await Promise.all([getNotebookView({ tab, course }), getSignedInAccount(), cookies()]);
  if (!view || !signedIn) redirect(`/login?${new URLSearchParams({ next: NOTEBOOK_PATH }).toString()}`);

  const lang = parseSurfaceLang(cookieStore.get(SURFACE_LANG_COOKIE)?.value);
  const m = notebookCopy[lang];
  // An empty notebook can still have completed lessons, so the record stays above the invitation
  // unless every number is zero (0239 Decision 4).
  const hasRecord = Object.values(view.record).some((n) => n > 0);

  return (
    <main className="grid-paper flex-1">
      <section>
        <div className={`${LESSON_HEADER_COLUMN_CLASS} relative flex flex-col gap-8 pb-6 pt-5 lg:pt-6`}>
          <BandTopBar
            back={{ href: "/my", label: m.backToMy }}
            account={<AccountMenu account={signedIn} lang={lang} next="/" />}
          />
          <div className={`${HERO_ENTER_CLASS} flex flex-col items-start gap-3`}>
            <span className={PAPER_PILL_HIGHLIGHT_CLASS}>{m.eyebrow}</span>
            <h1 className="text-balance font-display text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
              {m.title}
            </h1>
            <p className="max-w-xl text-base text-muted-foreground sm:text-lg">{m.lead}</p>
          </div>
        </div>
      </section>

      <div className={`${LESSON_HEADER_COLUMN_CLASS} flex w-full flex-col gap-6 pb-12 pt-4 sm:pb-16`}>
        {view.summary && <SummarySection lang={lang} view={view} card={view.summary} />}
        {(view.empty !== "notebook" || hasRecord) && <RecordRow lang={lang} view={view} />}
        {/* PROG-016 (0241): an own note can be added from an empty notebook too. */}
        <AddNote lang={lang} />
        {view.empty === "notebook" ? <EmptyNotebook lang={lang} /> : <ListSection lang={lang} view={view} />}
        <RecordingsSection lang={lang} view={view} now={new Date()} />
      </div>
    </main>
  );
}
