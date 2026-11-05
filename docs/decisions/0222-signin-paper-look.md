# 0222 — VIS-006: the sign-in screens in the landing's paper look

## Context

0169 gave the English sign-in entry the violet and listed one "Revisit when": the paper ground, ink
outlines or the display face, which needs the fonts on the auth route (a bundle decision). This card
makes that decision. The owner asked for the landing's look on `/login`, `/signup`, "Forgot password?",
"Check your email" and `/reset-password` (the last for everyone, Colloquiz users included: the page cannot
tell which entry a user came from, and Colloquiz now sits behind a footer link).

## Decisions

1. **One frame, one behaviour path.** `app/(colloquiz)/(auth)/PaperAuthFrame.tsx` holds the grid paper, the
   left half of the landing header and the centred card column, plus the wrapper classes (`surface-alina`,
   the three font variables, `font-sans`). `AuthScreen` builds its content once and renders it in the
   frame (English entry) or in the old two-panel layout (Colloquiz entry); state, handlers, redirects, the
   funnel source, the bfcache reset and the `replaceState` calls are not forked. `Field` gets the look
   through a `paper` prop. `EnglishAuthPanel` is deleted. `ResetPasswordScreen` always uses the frame.
2. **Fonts: one next/font definition each, in `app/displayFonts.ts`** (Unbounded 800 preloaded, Caveat 600
   not), imported by the English layout and by the frame, following `app/bodyFont.ts` (0219 Decision 4).
3. **Owner decision, 2026-11-05: accept the extra preloads.** The card's Fonts line said Unbounded may
   gain preloads only on `/login`, `/signup`, `/reset-password`, and to stop otherwise. It reached every
   route (table below), because next/font's preloads follow Next's merged CSS chunks (0219 "Preloads").
   The owner chose to keep Unbounded as one preloaded definition and accept that. Reasons:
   - The English routes preload exactly what they did before (same three files).
   - The cost lands on Colloquiz and Studio: two files, 21,708 B + 13,108 B = 34.8 KB, on a browser's first
     visit, from cache after. Before 0219 these routes preloaded Unbounded anyway, and 0219 accepted the
     same trade for Montserrat on Colloquiz.
   - A plain `@font-face` gives Unbounded a second URL, so a learner tapping "Log in" on the landing would
     download it again (0219 Decision 4 measured this), loses next/font's size-adjusted fallback (the
     heading would jump), and needs a font source: a committed woff2 or Google's CDN, a new third party for
     the legal pages.
   - Montserrat 800 would drop the face that most makes the screens read as the landing.
   - Accepted side effect: a Colloquiz or Studio page with no Unbounded text logs "preloaded but not used".
   `cssChunking` is untouched.
4. **`TAGLINE` is in `lib/alliengll/tagline.ts`, re-exported by `copy.ts`.** The card said to move it into
   `copy.ts`, with `LandingHeader` importing it from there. Done literally, the whole `alliengllCopy` object
   reached `/` (measured: `/` 192.6 -> 194.2 KB, "Answer review" in a chunk `/` loads), which `copy.ts`'s
   header forbids. `LandingHeader` and the frame import the one-line module; `copy.ts` re-exports it, so it
   is still one string, Russian in both languages (0156 Decision 11).
5. **Interpretation:** the forgot view's "Remember your password? Back to sign in" stays an inline link
   (the card lists "every Back to sign in" as a full-width button; that one sits in a sentence under the
   form's own "Send reset link" button). The check-your-email and expired-link ones are full-width.
6. `/reset-password`'s expired "Back to sign in" goes to `/login?error=recovery_expired&next=/`. Nobody's
   destination changes (`/` is where a sign-in without `next` lands). The link opened from the email
   (`app/auth/confirm/route.ts`) still redirects without `next`, so that path opens the plain look.

## Evidence

Preloads, `.next/server/next-font-manifest.json` after `next build` (before = HEAD without this card):

| group | before | after |
|---|---|---|
| Colloquiz (35 routes), Studio (28), one other | 1 file: Montserrat `e8f2fbee…` 35,508 B | 3 files |
| English (11 routes) | 3 files | the same 3 files |

The three files: `e8f2fbee…` 35,508 B, `0c30a228…` 21,708 B, `e27dd4ed…` 13,108 B; the last two match 0219's
Unbounded latin and cyrillic sizes. Printed for `/app/achievements`, `/studio/authors`, `/login` and `/my`:
identical lists.

`npm run budget` (local stack; fixture-dependent routes fail with 404 or sign-in timeouts before and
after): `/login` 287.5 -> 289.2 KB of 380; `/` 192.6 -> 192.9 of 202 (+0.3, the shared link class);
`/` phone 185.6 -> 185.9 of 194; `/invite`, `/join` 177.1 -> 177.1.

Edge, `next dev` on the local stack, light and dark, 360x640 (signup) / 360x800 and 1280x800:
`scrollWidth/innerWidth` equals the width in every cell of log in, forgot, check your email (after a reset
request), sign up, `/login?error=recovery_expired&next=/` (message present), `/reset-password` expired
and with a session, 28 of 28 cells, and no inner scroller overflows. At 360x640 the sign-up view scrolls, the
header is at the top and "Create Account" scrolls to the viewport bottom; the card's right edge is 344 px
(shadow inside 360). Plain `/login` form panel DOM is byte-identical before and after at 1280 and 360, and
the 360 screenshot is byte-identical (the 1280 screenshot differs only by the animated floating cards).
Fonts loaded: Unbounded and Caveat on `/login?next=/` and `/reset-password`; plain `/login` Geist only.
Focus shadow `rgb(91,63,217)` on the card, contrast 6.65:1 light; dark `rgb(165,149,234)` on `#171717`,
6.90:1 (both at least 3:1).

Not measured: autofill with a real saved login (headless Edge has none; the rule is the `:-webkit-autofill`
inset shadow in `app/globals.css`), a phone, the sign-up "check your email" view (same component as the reset
one), the (auth) error boundary.

## Revisit when

- `cssChunking: 'strict'` is measured (proposed card): it would take Unbounded and Montserrat off the
  routes that do not use them.
- 0169's "Revisit when" is closed by this decision.
