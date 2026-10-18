import { Brain } from "lucide-react";
import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import { landingCopy } from "./landingCopy";
import { StickerFigure } from "./StickerFigure";

/**
 * The landing hero's comic panel and its "10-15 minutes a day" sticker
 * (SHELL-027, docs/decisions/0165), laid out as the owner's mockups draw it
 * (SHELL-032, docs/decisions/0168): one square framed block of four quarters,
 * tilted by 1°, with the violet offset shadow. Left column, the drawings: the
 * big dinosaur roaring on the light violet cell (`bg-brand-subtle`, close to
 * the mockup's sampled cell colour in 0162), and the small, sweating one with
 * its "uhh... um" bubble standing on a dashed line. Right column, their captions ("English in
 * my head", "English I speak") in bold sans. The round sticker sits over the
 * top right corner. Under the block, the owner's line "it's normal:
 * understanding and speaking are different skills" (SHELL-031, 0167).
 *
 * The drawings are the owner's `dino-big.svg` and `dino-small.svg`
 * (docs/design/alina-cher/), redrawn inline with the same paths. Their hex
 * colours are tokens instead (`--comic-*`, `--ink`, `--brand-text`), so the
 * panel follows dark mode; the outline is `--ink`, which flips to a light line
 * on the dark cell, where the owner's dark-ink outline would vanish.
 *
 * A Server Component with no hooks: page.tsx renders it once per language and
 * the client `LandingContent` picks one, the `account` pattern (0086). The
 * panel itself costs no client JS on `/` (0078), with one exception: the
 * sticker's figure is two vendored react-bits `Counter`s (`StickerFigure`,
 * VIS-004, docs/decisions/0174), so the sticker is no longer server-only
 * (this supersedes 0165 Decision 9 for the sticker).
 */

const CAPTION_CELL_CLASS = "flex items-center p-3 sm:p-5";
const CAPTION_CLASS = "text-base font-bold leading-snug text-foreground sm:text-xl lg:text-2xl";

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
      className="h-auto w-full stroke-ink"
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
      className="h-auto w-1/2 stroke-ink"
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
    <div data-paper-quiet className="mt-6 lg:mt-0">
      <div className="relative -rotate-1 motion-reduce:rotate-0">
        {/* The quarters' inner lines are each cell's own right/bottom border,
            so the block reads as one frame split in four. */}
        <div className="grid aspect-square grid-cols-2 grid-rows-2 overflow-hidden rounded-md border-2 border-comic-frame bg-comic-cell shadow-[6px_6px_0_0_var(--brand)]">
          <div className="flex items-end border-r-2 border-b-2 border-comic-frame bg-brand-subtle p-3 sm:p-5">
            <DinoBig />
          </div>
          <div className={`${CAPTION_CELL_CLASS} border-b-2 border-comic-frame`}>
            <p className={CAPTION_CLASS}>{t.head}</p>
          </div>
          <div className="relative flex flex-col items-center justify-end border-r-2 border-comic-frame px-3 pb-3 pt-3 sm:px-5 sm:pb-5">
            <span className="mb-auto self-end rounded-full border-2 border-comic-frame bg-comic-cell px-2.5 py-0.5 font-accent text-base text-foreground sm:text-lg">
              {t.um}
            </span>
            <DinoSmall />
            <span aria-hidden="true" className="absolute inset-x-0 bottom-3 border-t-2 border-dashed border-comic-frame sm:bottom-5" />
          </div>
          <div className={CAPTION_CELL_CLASS}>
            <p className={CAPTION_CLASS}>{t.speak}</p>
          </div>
        </div>
        <span className="pointer-events-none absolute -right-1 -top-9 flex size-[5.5rem] rotate-6 flex-col items-center justify-center rounded-full border-2 border-highlight-foreground bg-highlight text-center leading-none text-highlight-foreground shadow-offset sm:-top-11 sm:size-28 xl:-right-5">
          <span className="font-display font-extrabold">
            <StickerFigure figure={t.sticker.figure} />
          </span>
          <span className="mt-0.5 text-[0.65rem] font-semibold sm:text-xs">{t.sticker.unit}</span>
        </span>
      </div>
      <p className="mt-5 flex items-start gap-2 font-accent text-lg leading-tight text-foreground sm:text-xl">
        <Brain className="mt-0.5 size-5 flex-none text-brand-text" aria-hidden="true" />
        {t.note}
      </p>
    </div>
  );
}
