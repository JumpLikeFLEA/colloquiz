import Link from "next/link";
import { LESSON_HEADER_COLUMN_CLASS } from "@/app/components/lesson-player/columnLayout";

/**
 * Pure footer markup shared by `EnglishFooter` (global, Russian, every
 * other route) and `LandingFooter` (landing-page-only, bilingual) so the
 * two can't drift in proportions. Sizes/spacing follow the Claude Design
 * import's footer literally (mobile: 14px body text, a 13px second row;
 * desktop: the same, laid out as one row) rather than the larger
 * `text-sm`/`text-xs` split this carried right after the import — that
 * read noticeably taller than the design once shipped (owner feedback,
 * 2026-09-28).
 */
export function FooterLayout({
  heading,
  desc,
  privacyLabel,
  copyright,
}: {
  heading: string;
  desc: string;
  privacyLabel: string;
  copyright: string;
}) {
  return (
    <footer className="border-t border-border">
      <div
        className={`${LESSON_HEADER_COLUMN_CLASS} flex flex-col gap-3 py-5 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-6 sm:py-7`}
      >
        <Link href="/app" className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2.5">
          <span className="font-semibold text-foreground">{heading}</span>
          <span className="text-muted-foreground">{desc}</span>
        </Link>
        <div className="flex items-center justify-between gap-6 text-xs text-muted-foreground">
          <Link href="/privacy" className="transition-colors hover:text-foreground">
            {privacyLabel}
          </Link>
          <span>{copyright}</span>
        </div>
      </div>
    </footer>
  );
}
