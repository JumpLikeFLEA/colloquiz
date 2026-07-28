import type { CSSProperties } from "react";

/**
 * Categorical hues — subject, duel tier, achievement category and rarity — are
 * IDENTITY, not status. The hue IS the thing being named ("Biology is the green
 * one"), so it is stored as a single value and deliberately does not move with
 * the theme: a subject that changes colour in dark mode has stopped being a
 * label. That is why these hues are not tokens and never became --success /
 * --destructive style pairs; the amber, orange and violet in the ramps sit next
 * to a warning colour without being one.
 *
 * What DID have to stop being data is the background. Each of these hues used
 * to ship a hand-picked near-white tint beside it (#eef2ff for indigo, #fffbeb
 * for amber, …) which was written straight into an inline style. An inline
 * style outranks every stylesheet, so those tints could not respond to the
 * theme at all and painted a glaring pale block on a dark page — the same bug
 * --brand-subtle was created to fix, but hidden inside a data file where no CSS
 * sweep would ever find it.
 *
 * So the surface is derived from the hue at render instead: a wash of the hue
 * into whatever --card currently is. One expression covers both themes, because
 * the theme-dependent half is the var, not the hue.
 */

/**
 * Share of the hue in a chip surface.
 *
 * Chosen for DARK, not light. Fitting the old hand-picked light tints would put
 * this near 8%, but 8% of a hue over the near-black --card is within noise of
 * the card itself and the chip stops reading as a chip. 12% separates on both
 * (≈1.2:1 against --card in dark) at the cost of deepening the light tint very
 * slightly — the light chips are a shade stronger than the Tailwind-50 values
 * they replace.
 */
export const CHIP_TINT = "12%";

/** One step up from CHIP_TINT: an outline has to survive on top of the wash. */
const CHIP_BORDER_TINT = "30%";

/** The one place the mix is spelled out, so a chip and its outline cannot drift. */
const wash = (color: string, amount: string) =>
  `color-mix(in oklab, ${color} ${amount}, var(--card))`;

/**
 * Chip styling for a categorical hue: the hue as the foreground, and a wash of
 * it over the current --card as the background.
 *
 * The hue is bound to --categorical-color so it is named once and read up to
 * three times (foreground, wash, outline). Icons inherit it through
 * currentColor, so a lucide child needs no colour of its own.
 *
 * NOTE ON CONTRAST: the wash tracks the surface, but the hue does not, and a
 * saturated blue-violet has genuinely low relative luminance (#4f46e5 is 2.4:1
 * on --card no matter what sits behind it). The deep indigo/violet members of
 * these ramps therefore read weakly in dark and are suitable for icons and
 * decorative fills, not for small text carrying meaning of its own. Fixing that
 * would mean moving the hue by theme, which is the one thing identity colour
 * must not do.
 */
export function chipStyle(color: string, opts?: { border?: boolean }): CSSProperties {
  return {
    "--categorical-color": color,
    color: "var(--categorical-color)",
    backgroundColor: wash("var(--categorical-color)", CHIP_TINT),
    ...(opts?.border && { borderColor: wash("var(--categorical-color)", CHIP_BORDER_TINT) }),
  } as CSSProperties;
}

/**
 * Just the outline, for something tinted by a categorical hue without being
 * filled by it — an achievement card carrying its rarity on the border.
 */
export function categoricalBorderColor(color: string): string {
  return wash(color, CHIP_BORDER_TINT);
}
