"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { pickContinueLesson } from "@/lib/continueLesson";
import type { AttemptsByLessonSlug } from "@/lib/coursePageProgress";
import {
  anonAttemptSummary,
  anonLastOpenedSlug,
  anonStoreSnapshot,
  parseAnonSnapshot,
  type AnonLesson,
} from "@/lib/lessonPlayer/anonProgress";
import { OFFSET_CTA_CLASS } from "../../surfaceClasses";

/**
 * PROG-003 (docs/decisions/0179) — what an anonymous visitor's browser knows
 * about this course: the per-row ✓ and the "Continue" CTA, from the local
 * attempt and opens stores. Signed-in learners never mount it: the server
 * decides for them from `get_course_attempt_summary`.
 *
 * No layout shift is the design constraint. The server HTML is the ordinary
 * first-lesson page; after hydration only (a) the CTA's text and href change,
 * on a single truncated line so its height cannot, and (b) a ✓ appears,
 * absolutely positioned on the row's number tile. Nothing is inserted into the
 * flow, which is also why an anonymous visitor gets no score pill or progress
 * tiles here (they would have to reserve space on every first visit).
 *
 * The snapshot is the two stores' raw strings, so `useSyncExternalStore` sees a
 * stable primitive; the server snapshot is empty, so the first client render
 * matches the server HTML. `pageshow` re-reads after a back navigation from a
 * lesson restores this page from the bfcache.
 */

type ProviderLesson = AnonLesson & { title: string };

type Value = { summary: AttemptsByLessonSlug; pick: ProviderLesson | null };

const EMPTY: Value = { summary: {}, pick: null };
const Ctx = createContext<Value>(EMPTY);

function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener("pageshow", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("pageshow", onChange);
  };
}

const getSnapshot = () => anonStoreSnapshot(readStore);
const getServerSnapshot = () => "";

/** `lessons` are the course's lessons open to this visitor, in course order. */
export function AnonymousProgressProvider({ lessons, children }: { lessons: ProviderLesson[]; children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const value = useMemo<Value>(() => {
    if (snapshot === "") return EMPTY;
    const { attempts, opens } = parseAnonSnapshot(snapshot);
    const summary = anonAttemptSummary(lessons, attempts, opens);
    const pick = pickContinueLesson(
      lessons.map((l) => ({ ...l, state: "open" as const })),
      summary,
      anonLastOpenedSlug(lessons, opens),
    );
    return { summary, pick };
  }, [snapshot, lessons]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The hero button. Renders the server's first-lesson link until a pick exists. */
export function AnonymousCta({
  courseSlug,
  href,
  label,
  continuePrefix,
}: {
  courseSlug: string;
  href: string;
  label: string;
  continuePrefix: string;
}) {
  const { pick } = useContext(Ctx);
  const target = pick ? { href: `/courses/${courseSlug}/${pick.slug}`, label: `${continuePrefix}${pick.title}` } : { href, label };
  return (
    <Link href={target.href} className={`${OFFSET_CTA_CLASS} max-w-full`}>
      <span className="truncate">{target.label}</span>
      <ArrowRight
        className="size-4 flex-none transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        aria-hidden="true"
      />
    </Link>
  );
}

/** The ✓ on a lesson row's number tile; the same markup the server renders. */
export function AnonymousTick({ slug }: { slug: string }) {
  const { summary } = useContext(Ctx);
  if (summary[slug]?.complete !== true) return null;
  return (
    <span
      aria-hidden="true"
      className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-success-subtle text-success ring-2 ring-card"
    >
      <Check className="size-3" strokeWidth={3} />
    </span>
  );
}
