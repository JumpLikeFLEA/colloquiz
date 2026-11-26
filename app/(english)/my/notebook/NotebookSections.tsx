import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Mic, Pencil, Plus, Sparkles } from "lucide-react";
import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import { notebookHref } from "@/lib/notebook/href";
import type { NotebookView } from "@/lib/notebook/notebookView";
import type { RecordingRow } from "@/lib/notebook/recordings";
import { openLessonHref, rowSource, type SourceRow } from "@/lib/notebook/source";
import type { SummaryCard as Card } from "@/lib/notebook/summaryCard";
import { NOTEBOOK_TABS } from "@/lib/notebook/tabs";
import type { SummaryKind } from "@/lib/notebook/types";
import { LocalDateTime } from "../../LocalDateTime";
import { OFFSET_CTA_CLASS, PAPER_EMPTY_BOX_CLASS, PAPER_LINK_INLINE_CLASS, PAPER_PANEL_CLASS } from "../../surfaceClasses";
import { myCopy } from "../myCopy";
import { EntryActions } from "./EntryActions";
import { NoteForm } from "./NoteForm";
import { notebookCopy } from "./notebookCopy";
import { noteFormCopy, type NoteFormStrings } from "./noteFormCopy";

/**
 * The notebook page's sections (PROG-014, docs/decisions/0240). Server Components: the tabs and the
 * course chips are links, the recordings fold in a native `<details>`. Nothing is filtered or
 * decided here; `notebookView` (lib/notebook) already did. No audio player (0120 Decision 3).
 *
 * Copied text is the learner's English or the model's, so it carries `lang="en"`; an own note can
 * be in any language and does not.
 */
type Props = { lang: SurfaceLang; view: NotebookView };

/** One language's form strings, without the confirmation builders: what a client component gets. */
function formStrings(lang: SurfaceLang): NoteFormStrings {
  const { confirm: _confirm, ...strings } = noteFormCopy[lang];
  return strings;
}

const SMALL_PILL_CLASS = "inline-flex w-fit items-center rounded-full bg-brand-subtle px-2 py-0.5 text-xs font-medium text-brand-text";
const MUTED_PILL_CLASS = "inline-flex w-fit items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground";
const FOCUS_CLASS = "outline-none focus-visible:ring-2 focus-visible:ring-brand";

const localeFor = (lang: SurfaceLang) => (lang === "ru" ? "ru-RU" : "en-GB");

function kindLabel(kind: SummaryKind, lang: SurfaceLang): string {
  const m = myCopy[lang];
  return kind === "final" ? m.aiFinal : kind === "interim" ? m.aiInterim : m.aiFirst;
}

/** "Course · Lesson", a link where the lesson has a page for this learner. */
function Source({ row, view }: { row: SourceRow; view: NotebookView }) {
  const { courseTitle, lessonTitle, href } = rowSource(row, view.sources);
  const text = [courseTitle, lessonTitle].filter(Boolean).join(" · ");
  if (!text) return null;
  return (
    <p className="break-words text-xs text-muted-foreground">
      {href ? (
        <Link href={href} prefetch={false} className={`rounded underline-offset-4 hover:underline ${FOCUS_CLASS}`}>
          {text}
        </Link>
      ) : (
        text
      )}
    </p>
  );
}

export function SummarySection({ lang, view, card }: Props & { card: Card }) {
  const m = notebookCopy[lang];
  const { summary, text, follow } = card;
  return (
    <section className={`${PAPER_PANEL_CLASS} flex flex-col gap-3 p-4 sm:p-5`} data-notebook="summary">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 flex-none text-brand-text" aria-hidden="true" />
        <h2 className="text-base font-semibold text-foreground">{m.summaryTitle}</h2>
        <span className={SMALL_PILL_CLASS}>{kindLabel(summary.kind, lang)}</span>
      </div>
      {text && (
        <p lang="en" className="break-words text-sm text-foreground sm:text-base">
          {text}
        </p>
      )}
      {follow.kind === "none" ? (
        <p className="text-sm text-muted-foreground">{m.noFollow}</p>
      ) : (
        <div className="rounded-xl bg-brand-subtle p-3">
          <p className="text-xs font-semibold text-brand-text">{follow.kind === "goal" ? m.goal : m.nextStep}</p>
          <p lang="en" className="break-words text-sm text-foreground">
            {follow.text}
          </p>
        </div>
      )}
      <Source row={summary} view={view} />
      <p className="text-xs text-muted-foreground">{myCopy[lang].aiLead}</p>
      <EntryActions
        strings={formStrings(lang)}
        kind="summary"
        id={summary.submissionId}
        confirm={noteFormCopy[lang].confirm.summary()}
        label={m.summaryTitle}
      />
    </section>
  );
}

/** The four numbers, in one row at every width (0235). */
export function RecordRow({ lang, view }: Props) {
  const m = notebookCopy[lang];
  const cells = [
    [view.record.lessonsCompleted, m.lessonsCompleted],
    [view.record.recordingsSent, m.recordingsSent],
    [view.record.phrasesSaid, m.phrasesSaid],
    [view.record.notesSaved, m.notesSaved],
  ] as const;
  return (
    <dl aria-label={m.recordLabel} className={`${PAPER_PANEL_CLASS} grid grid-cols-4 divide-x divide-border`} data-notebook="record">
      {cells.map(([value, label]) => (
        <div key={label} className="flex min-w-0 flex-col-reverse justify-end gap-0.5 px-0.5 py-3 text-center sm:px-2">
          <dt className="text-[11px] leading-tight text-muted-foreground sm:text-xs">{label}</dt>
          <dd className="font-display text-xl font-extrabold text-foreground sm:text-2xl">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const CHIP_CLASS = `inline-flex min-h-11 max-w-full items-center rounded-full border-2 border-ink px-4 py-1.5 text-sm font-semibold transition-colors ${FOCUS_CLASS}`;
const CHIP_ON_CLASS = "bg-highlight text-highlight-foreground";
const CHIP_OFF_CLASS = "bg-card text-foreground hover:bg-muted";

function CourseChips({ lang, view }: Props) {
  const m = notebookCopy[lang];
  if (view.chips.length === 0) return null;
  const chips = [{ courseId: null, title: m.allCourses }, ...view.chips];
  return (
    <nav aria-label={m.coursesLabel} className="flex flex-wrap gap-2" data-notebook="chips">
      {chips.map((c) => {
        const on = c.courseId === view.courseId;
        return (
          <Link
            key={c.courseId ?? "all"}
            href={notebookHref(view.tab, c.courseId)}
            scroll={false}
            prefetch={false}
            aria-current={on ? "true" : undefined}
            className={`${CHIP_CLASS} ${on ? CHIP_ON_CLASS : CHIP_OFF_CLASS}`}
          >
            <span className="min-w-0 break-words">{c.title ?? m.untitledCourse}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Tabs({ lang, view }: Props) {
  const m = notebookCopy[lang];
  return (
    <nav aria-label={m.tabsLabel} className="flex border-b-2 border-ink" data-notebook="tabs">
      {NOTEBOOK_TABS.map((tab) => {
        const on = tab === view.tab;
        return (
          <Link
            key={tab}
            href={notebookHref(tab, view.courseId)}
            scroll={false}
            prefetch={false}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-11 min-w-0 flex-auto flex-wrap items-center justify-center gap-x-1.5 border-b-4 px-1 py-2 text-sm font-semibold sm:flex-none sm:px-5 ${FOCUS_CLASS} ${on ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {m.tabs[tab]}
            <span className="text-xs font-medium tabular-nums">{view.counts[tab]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Row({ id, children }: { id: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 p-4" data-row={id}>
      {children}
    </li>
  );
}

function ListRows({ lang, view }: Props) {
  const m = notebookCopy[lang];
  if (view.tab === "phrases") {
    return view.phrases.map((p) => (
      <Row key={p.id} id={p.id}>
        {p.kind === "said" ? (
          <Mic className="mt-0.5 size-4 flex-none text-brand-text" role="img" aria-label={m.saidIcon} />
        ) : (
          <Pencil className="mt-0.5 size-4 flex-none text-muted-foreground" role="img" aria-label={m.ownIcon} />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p lang={p.kind === "said" ? "en" : undefined} className="break-words text-sm font-semibold text-foreground sm:text-base">
            {p.phrase}
          </p>
          {p.kind === "said" ? (
            <p className="break-words text-sm text-muted-foreground">
              {m.youSaid}: <q lang="en">{p.quote}</q>
              {p.close && <span className={`${MUTED_PILL_CLASS} ml-1.5`}>{m.close}</span>}
            </p>
          ) : (
            p.note && <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{p.note}</p>
          )}
          <Source row={p} view={view} />
          <EntryActions
            strings={formStrings(lang)}
            kind="entry"
            id={p.id}
            label={p.phrase}
            confirm={p.kind === "said" ? noteFormCopy[lang].confirm.said(p.phrase, p.takes) : noteFormCopy[lang].confirm.own(p.phrase)}
            edit={p.kind === "own" ? { phrase: p.phrase, note: p.note } : undefined}
          />
        </div>
      </Row>
    ));
  }
  if (view.tab === "fixes") {
    return view.fixes.map((f) => (
      <Row key={f.id} id={f.id}>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="break-words text-sm text-muted-foreground">
            {m.youSaid}: <q lang="en">{f.quote}</q>
          </p>
          <p className="break-words text-sm font-semibold text-foreground sm:text-base">
            <span className="font-medium text-brand-text">{m.better}:</span> <span lang="en">{f.correction}</span>
          </p>
          <Source row={f} view={view} />
          <EntryActions
            strings={formStrings(lang)}
            kind="entry"
            id={f.id}
            label={f.correction}
            confirm={noteFormCopy[lang].confirm.fix(f.quote, f.correction)}
          />
        </div>
      </Row>
    ));
  }
  return view.toTry.map((t) => (
    <Row key={`${t.lessonId}/${t.phrase}`} id={t.phrase}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p lang="en" className="break-words text-sm font-semibold text-foreground sm:text-base">
          {t.phrase}
        </p>
        <Source row={{ courseId: t.courseId, lessonId: t.lessonId, courseTitle: null, lessonTitle: null }} view={view} />
      </div>
    </Row>
  ));
}

export function ListSection({ lang, view }: Props) {
  const m = notebookCopy[lang];
  return (
    <section className="flex flex-col gap-4" aria-label={m.tabs[view.tab]}>
      <CourseChips lang={lang} view={view} />
      <Tabs lang={lang} view={view} />
      {view.empty === null ? (
        <ul className={`${PAPER_PANEL_CLASS} divide-y divide-border`} data-notebook="list">
          <ListRows lang={lang} view={view} />
        </ul>
      ) : (
        <p className={`${PAPER_EMPTY_BOX_CLASS} p-6 text-center text-sm text-muted-foreground`} data-notebook={`empty-${view.empty}`}>
          {view.empty === "course" ? m.emptyCourse : m.emptyTab[view.tab]}
        </p>
      )}
    </section>
  );
}

/** What the audio's state reads as. The kept-until date is the UTC date of the purge moment. */
function AudioState({ lang, row, now }: { lang: SurfaceLang; row: RecordingRow; now: Date }) {
  const m = notebookCopy[lang];
  if (row.audio.state === "deleted") return row.hasNotes ? m.audioDeletedNotesKept : m.audioDeleted;
  const { until } = row.audio;
  if (until === null) return null;
  // The purge is a daily cron, so a take can be past its date and still here.
  if (Date.parse(until) <= now.getTime()) return m.deletedSoon;
  const date = new Date(until).toLocaleDateString(localeFor(lang), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <>
      {m.keptUntil} <time dateTime={until}>{date}</time>
    </>
  );
}

export function RecordingsSection({ lang, view, now }: Props & { now: Date }) {
  const m = notebookCopy[lang];
  if (view.recordings.length === 0) return null;
  return (
    <details className={`${PAPER_PANEL_CLASS} group`} data-notebook="recordings">
      <summary
        className={`flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-foreground sm:text-base ${FOCUS_CLASS} [&::-webkit-details-marker]:hidden`}
      >
        <Mic className="size-4 flex-none text-brand-text" aria-hidden="true" />
        {m.recordingsTitle}
        <span className="text-xs font-medium tabular-nums text-muted-foreground">{view.recordings.length}</span>
        <ChevronDown className="ml-auto size-4 flex-none transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <ul className="divide-y divide-border border-t border-border">
        {view.recordings.map((row) => {
          const { courseTitle, lessonTitle } = rowSource(row.take, view.sources);
          const href = row.audio.state === "kept" ? openLessonHref(row.take, view.sources) : null;
          return (
            <li key={row.take.id} className="flex flex-col gap-1.5 p-4" data-recording={row.take.id}>
              <p className="break-words text-sm font-semibold text-foreground">
                {[courseTitle, lessonTitle].filter(Boolean).join(" · ") || m.recording}
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {row.kind && <span className={SMALL_PILL_CLASS}>{kindLabel(row.kind, lang)}</span>}
                <LocalDateTime iso={row.take.submittedAt} locale={localeFor(lang)} />
              </div>
              <p className="text-xs text-muted-foreground">
                <AudioState lang={lang} row={row} now={now} />
              </p>
              {href && (
                <Link href={href} prefetch={false} className={`${PAPER_LINK_INLINE_CLASS} inline-flex min-h-11 w-fit items-center rounded-lg text-sm`}>
                  {m.listen}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** Nothing in the notebook at all (0235 input 8): an invitation and one button. */
export function EmptyNotebook({ lang }: { lang: SurfaceLang }) {
  const m = notebookCopy[lang];
  return (
    <section className={`${PAPER_EMPTY_BOX_CLASS} flex flex-col items-center gap-4 p-6 text-center sm:p-10`} data-notebook="empty-notebook">
      <h2 className="text-lg font-semibold text-foreground">{m.emptyTitle}</h2>
      <p className="max-w-md text-sm text-muted-foreground sm:text-base">{m.emptyBody}</p>
      <Link href="/#catalogue" className={OFFSET_CTA_CLASS}>
        {m.chooseCourse}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

/** PROG-016 — "Add a phrase": a native `<details>`, closed on every load. A new note has no lesson. */
export function AddNote({ lang }: { lang: SurfaceLang }) {
  const f = noteFormCopy[lang];
  return (
    <details className={`${PAPER_PANEL_CLASS} group`} data-notebook="add">
      <summary
        className={`flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-foreground sm:text-base ${FOCUS_CLASS} [&::-webkit-details-marker]:hidden`}
      >
        <Plus className="size-4 flex-none text-brand-text" aria-hidden="true" />
        {f.addTitle}
        <ChevronDown className="ml-auto size-4 flex-none transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <div className="flex flex-col gap-3 border-t border-border p-4">
        <p className="text-sm text-muted-foreground">{f.addLead}</p>
        <NoteForm strings={formStrings(lang)} />
      </div>
    </details>
  );
}
