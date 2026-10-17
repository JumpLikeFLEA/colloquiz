import { Brain } from "lucide-react";
import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import { landingCopy } from "./landingCopy";

/**
 * The landing hero's comic panel and its "10-15 minutes a day" sticker
 * (SHELL-027, docs/decisions/0165). Two cells, as in the owner's design: a big
 * dinosaur roaring ("English in my head") and a small, sweating one ("English I
 * speak", with its "uhh... um" bubble). Under the panel, the owner's line "it's
 * normal: understanding and speaking are different skills", and the sticker's
 * figure set large over its unit, both from the owner's mockups (SHELL-031,
 * docs/decisions/0167).
 *
 * The drawings are the owner's `dino-big.svg` and `dino-small.svg`
 * (docs/design/alina-cher/), redrawn inline with the same paths. Their hex
 * colours are tokens instead (`--comic-*`, `--ink`, `--brand-text`), so the
 * panel follows dark mode; the outline is `--ink`, which flips to a light line
 * on the dark cell, where the owner's dark-ink outline would vanish.
 *
 * A Server Component with no hooks: page.tsx renders it once per language and
 * the client `LandingContent` picks one, the `account` pattern (0086), so the
 * panel costs no client JS on `/` (0078).
 */

const CELL_CLASS =
  "relative flex flex-col gap-2 rounded-2xl border-2 border-comic-frame bg-comic-cell p-3 shadow-[4px_4px_0_0_var(--brand)] sm:p-4";
const CAPTION_CLASS = "font-accent text-lg leading-tight text-foreground sm:text-xl";

function DinoBig() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 215 145"
      fill="none"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-auto h-auto w-full stroke-ink"
    >
      <path
        d="M6 96 C 30 88, 50 70, 70 60 C 90 50, 105 46, 118 42 C 124 30, 134 22, 150 22 C 166 22, 182 26, 192 32 L 194 42 L 166 46 L 190 58 C 184 66, 168 70, 150 68 C 142 76, 136 84, 132 92 L 142 96 L 140 102 L 128 98 C 124 104, 120 108, 116 110 L 124 136 L 136 138 L 112 140 L 100 114 C 92 116, 84 116, 78 114 L 74 136 L 86 138 L 60 140 L 56 110 C 40 106, 22 102, 6 96 Z"
        className="fill-comic-dino-big"
      />
      <circle cx="154" cy="33" r="2.6" className="fill-ink" />
      <path d="M170 46 l3 6 M178 46 l3 6 M186 45 l2 5" />
      <path d="M198 36 l10 -4 M200 48 l10 0 M198 60 l9 4" className="stroke-brand-text" />
      <path d="M70 62 l-6 -8 M86 54 l-5 -9 M102 48 l-4 -9" strokeWidth={2.5} />
    </svg>
  );
}

function DinoSmall() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="6 4 92 84"
      fill="none"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-auto h-auto w-full stroke-ink"
    >
      <path
        d="M12 64 C 22 60, 28 56, 32 52 C 34 40, 44 34, 52 36 C 54 26, 60 18, 70 18 C 82 18, 88 26, 86 34 C 84 40, 76 42, 68 42 C 70 50, 70 58, 66 64 L 70 80 L 76 82 L 62 82 L 58 68 C 52 70, 46 70, 40 68 L 40 82 L 46 84 L 32 84 L 32 66 C 24 68, 18 68, 12 64 Z"
        className="fill-comic-dino-small"
      />
      <circle cx="74" cy="27" r="2" className="fill-ink" />
      <path d="M78 35 C 80 36, 82 36, 84 35" />
      <path d="M56 46 l-4 5 M62 46 l2 5" />
      <path d="M90 10 C 92 14, 92 17, 90 18 C 88 17, 88 14, 90 10 Z" className="fill-comic-drop stroke-brand-text" />
    </svg>
  );
}

export function ComicPanel({ lang }: { lang: SurfaceLang }) {
  const t = landingCopy[lang].comic;

  return (
    <div className="relative mt-4 lg:mt-0">
      <div className="grid grid-cols-2 gap-4 sm:gap-6">
        <div className={CELL_CLASS}>
          <p className={CAPTION_CLASS}>{t.head}</p>
          <DinoBig />
        </div>
        <div className={CELL_CLASS}>
          <p className={CAPTION_CLASS}>{t.speak}</p>
          <span className="w-fit rounded-full border-2 border-comic-frame px-2.5 py-0.5 font-accent text-base text-foreground sm:text-lg">
            {t.um}
          </span>
          <DinoSmall />
        </div>
      </div>
      <span className="pointer-events-none absolute -top-12 right-1 flex rotate-6 flex-col items-center rounded-xl border-2 border-highlight-foreground bg-highlight px-3 py-1 text-center leading-none text-highlight-foreground shadow-offset sm:-right-2">
        <span className="font-display text-xl font-extrabold sm:text-2xl">{t.sticker.figure}</span>
        <span className="text-xs font-semibold">{t.sticker.unit}</span>
      </span>
      <p className="mt-4 flex items-start gap-2 font-accent text-lg leading-tight text-foreground sm:text-xl">
        <Brain className="mt-0.5 size-5 flex-none text-brand-text" aria-hidden="true" />
        {t.note}
      </p>
    </div>
  );
}
