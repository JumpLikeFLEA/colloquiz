import type { ReactNode } from "react";
import Link from "next/link";
import { bodyFont } from "@/app/bodyFont";
import { caveat, unbounded } from "@/app/displayFonts";
import { LESSON_HEADER_COLUMN_CLASS } from "@/app/components/lesson-player/columnLayout";
import { TAGLINE } from "@/lib/alliengll/tagline";
import { Mail } from "lucide-react";
import { Marker } from "@/app/(english)/AlinaMarks";
import { OFFSET_CTA_CLASS, OUTLINE_CTA_CLASS } from "@/app/(english)/surfaceClasses";

/**
 * The sign-in screens' paper frame (VIS-006, docs/decisions/0222): grid paper
 * under the left half of the landing's header and one centred card column.
 * Used by AuthScreen's English entry and by ResetPasswordScreen; plain
 * /login and /signup (the Colloquiz entry) never render it.
 *
 * This layout is Colloquiz's, so <html> carries none of the English surface's
 * classes. The wrapper supplies them: `surface-alina` re-points --brand* (0169),
 * and the three font variables plus `font-sans` give the body face
 * (Montserrat, 0219) and the two display faces. The font files come from the
 * shared definitions (app/bodyFont.ts, app/displayFonts.ts), the same URLs the
 * landing downloads.
 *
 * The header is the landing header's wordmark and tagline in the same place
 * and size, so tapping the landing's "Log in" does not move them. The card
 * column centres with `my-auto`, not `items-center`: auto margins drop to 0
 * when the form is taller than the screen, so its top stays reachable by
 * scrolling (0139).
 */
export function PaperAuthFrame({ children, footnote }: { children: ReactNode; footnote?: ReactNode }) {
  return (
    <div
      className={`surface-alina ${bodyFont.variable} ${unbounded.variable} ${caveat.variable} grid-paper flex h-full flex-col overflow-y-auto font-sans`}
    >
      <header className={`${LESSON_HEADER_COLUMN_CLASS} w-full pt-4 sm:pt-5`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-x-4">
          <Link
            href="/"
            className="flex min-h-11 items-center rounded-lg font-display text-lg tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand sm:text-xl"
          >
            Alina Cher
          </Link>
          <span className="flex min-h-11 items-center font-accent text-lg leading-none text-brand-text sm:min-h-0 sm:text-xl">
            {TAGLINE}
          </span>
        </div>
      </header>
      <div className="mx-auto my-auto w-full max-w-md px-4 py-8">
        {children}
        {footnote}
      </div>
    </div>
  );
}

/** The card the form sits in: the landing's panel frame, roomy padding. */
export const PAPER_AUTH_CARD_CLASS = "flex flex-col gap-6 p-6 sm:p-8";

// A disabled button neither lifts nor presses: pointer-events-none drops the
// hover and active variants, which are the lift and the press.
const DISABLED = "disabled:pointer-events-none disabled:opacity-60";

/** Sign In, Create Account, Send reset link, Update password, Back to sign in. */
export const PAPER_PRIMARY_BUTTON_CLASS = `${OFFSET_CTA_CLASS} w-full justify-center ${DISABLED}`;

/** The Telegram and Google buttons. */
export const PAPER_OAUTH_BUTTON_CLASS = `${OUTLINE_CTA_CLASS} w-full cursor-pointer ${DISABLED}`;

/**
 * A card heading in the display face with its last word on the marker. The
 * accessible text is the plain string: the marker is a styled span.
 */
export function PaperHeading({ text }: { text: string }) {
  const at = text.lastIndexOf(" ");
  return (
    <h1 className="font-display text-2xl font-extrabold leading-snug tracking-tight text-foreground sm:text-3xl">
      {text.slice(0, at + 1)}
      <Marker>{text.slice(at + 1)}</Marker>
    </h1>
  );
}

/** The "Check your email" chip: the hero sticker's style, round and tilted. */
export function PaperMailSticker() {
  return (
    <div className="flex size-16 rotate-6 items-center justify-center rounded-full border-2 border-highlight-foreground bg-highlight shadow-offset">
      <Mail size={28} className="text-highlight-foreground" aria-hidden="true" />
    </div>
  );
}
