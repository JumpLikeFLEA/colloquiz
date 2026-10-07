import { Clock, Gift, GraduationCap, MessageCircleQuestion } from "lucide-react";

/**
 * Decorative layers for the landing page's gradient surfaces (the hero band
 * and the closing CTA card) and the value strip's icons, docs/decisions/0078. Server Components, passed
 * into the client `LandingContent` as props so their markup arrives as HTML
 * and adds nothing to `/`'s client JS (the OPS-006 budget). Nothing here
 * depends on the EN/RU toggle: the word chips are English in both locales,
 * the same as the exercise they float around.
 *
 * Same visual vocabulary as the Colloquiz sign-in panel's `AuthLeftPanel`
 * (dot grid, white glow orb, white-on-gradient chips), rebuilt here rather
 * than imported because that panel animates with framer-motion, which is a
 * forbidden signature on English routes (scripts/budget.ts). The dot grid is
 * a CSS radial gradient rather than AuthLeftPanel's SVG <pattern>, so it can
 * be rendered more than once on a page without colliding pattern ids.
 */

export function GradientBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle,white_1.5px,transparent_1.5px)] [background-size:28px_28px] opacity-[0.08]" />
      <div className="absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -bottom-32 -left-24 size-96 rounded-full bg-brand-accent/40 blur-3xl" />
    </div>
  );
}

const CHIPS: { text: string; className: string; delay: string }[] = [
  { text: "since 1969", className: "-left-6 -top-5 -rotate-6", delay: "0s" },
  { text: "so far", className: "-right-8 top-1/2 rotate-3", delay: "-2s" },
  { text: "have walked", className: "-bottom-5 left-10 rotate-2", delay: "-4s" },
];

/** Floating English word chips around the hero demo card; `sm:` and up only,
 * since on a phone the card is full-width and the chips would only crowd it.
 * A SOLID `bg-brand-deep` fill, not AuthLeftPanel's translucent white: each
 * chip overlaps the white demo card at one edge, where white-on-white-wash
 * text vanished (seen in the first screenshot pass). */
export function HeroChips() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden sm:block">
      {CHIPS.map((chip) => (
        <span key={chip.text} className={`absolute ${chip.className}`}>
          <span
            className="landing-float inline-block rounded-full bg-brand-deep px-3 py-1.5 text-xs font-medium text-white shadow-lg shadow-brand-deep/40 ring-1 ring-white/30"
            style={{ animationDelay: chip.delay }}
          >
            {chip.text}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * The value strip's icons, one per `landingCopy[lang].values` entry in the
 * same order. Rendered here, server-side, and passed into `LandingContent`
 * as nodes rather than imported there: as client-component imports these
 * four icon definitions put `/` 0.3 KB over its 180 KB budget
 * (`npm run budget`, docs/decisions/0078); as server-rendered markup they
 * cost no client JS. Same reason as `GradientBackdrop`.
 */
export function valueIcons() {
  return [
    <Clock key="clock" className="size-4.5" aria-hidden="true" />,
    <GraduationCap key="level" className="size-4.5" aria-hidden="true" />,
    <Gift key="free" className="size-4.5" aria-hidden="true" />,
    <MessageCircleQuestion key="explained" className="size-4.5" aria-hidden="true" />,
  ];
}
