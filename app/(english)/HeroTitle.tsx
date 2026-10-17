import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import { HandOval, Marker } from "./AlinaMarks";
import { landingCopy } from "./landingCopy";

/**
 * The landing headline's words, as in the owner's mockups (SHELL-031,
 * docs/decisions/0167): the yellow marker on "больше" / "more" and the
 * hand-drawn oval on "сказать" / "say". The `<h1>` itself, with its size and
 * entry animation, stays in `LandingContent`.
 *
 * A Server Component rendered once per language by page.tsx, the `comic`
 * pattern (0165 Decision 9), so the oval's SVG and these strings cost no
 * client JS on `/`.
 */
export function HeroTitle({ lang }: { lang: SurfaceLang }) {
  const t = landingCopy[lang].heroTitle;

  return (
    <>
      {t.lead} <Marker>{t.marker}</Marker>
      {t.middle} <HandOval>{t.oval}</HandOval>
    </>
  );
}
