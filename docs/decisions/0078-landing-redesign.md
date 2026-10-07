# 0078 — Landing page redesign: gradient hero, mini-demo, size line on cards

## Context

Ad-hoc owner request (2026-10-07): the landing page at `/` (SHELL-010,
decision 0070, rebuilt from a Claude Design import on 2026-09-28) "looks
terrible — a lot of empty space, lonely text fields". It was a headline, a
CTA and the catalogue grid on a plain `bg-background`, with nothing to
anchor the eye and cards that said nothing about how big a course is.
docs/handoff.md, "Visual work" §3 is why this matters: the landing page is
the one page where visual quality IS the function — it exists to convert a
stranger arriving from a reel on a phone.

Options were settled with the owner in a planning session before any code
was written. This file records them plus the calls made while
implementing.

## Decision 1 — page structure, from existing visual vocabulary only

Top to bottom:

1. **A full-bleed brand-gradient hero band** (`from-brand-deep via-brand
   to-brand-accent`, a dot grid, glow orbs). The header (wordmark, EN/RU
   toggle, Log in) moves inside it and turns white-on-gradient. The headline
   and subtitle copy are unchanged. A white primary CTA keeps the same
   one-tap `heroHref` as 0070 Decision 2. A tappable demo card (Decision 3)
   sits beside the text at `lg`, and below the CTA on a phone.
2. **A value strip**: four true facts (10–15 min lessons, A2–B2, free first
   lessons with no signup, every mistake explained). It overlaps the hero's
   bottom edge.
3. **The catalogue**, unchanged in position and anchor (`#catalogue`).
4. **How it works**: three numbered steps.
5. **A closing gradient CTA card** repeating the hero's one-tap link.

No new tokens and no hex literals. The gradient, the dot grid, the
translucent-white surfaces and the white-on-brand pairing all come from the
Colloquiz sign-in panel's `AuthLeftPanel`. Everything else uses the
existing card, border, brand-subtle, success and destructive tokens. That
panel's gradient is dark in both themes, so the hero needs no dark-mode
variant, for the same reason as `AuthLeftPanel`.

`AuthLeftPanel` is not imported: it animates with framer-motion, a
forbidden signature on English routes (Decision 4). `app/(english)/
HeroDecor.tsx` rebuilds the vocabulary. Its dot grid is a CSS radial
gradient instead of an SVG `<pattern>`, so it can render twice on one page
(hero and closing card) without colliding pattern ids.

The hero word chips use a solid `bg-brand-deep` fill, not
`AuthLeftPanel`'s translucent white. Each chip overlaps the white demo card
at one edge, and on the first screenshot pass the translucent-white text
vanished there.

Copy makes only claims docs/handoff.md already makes about the product. It
quotes no learner counts or other figures that nothing measures.

## Decision 2 — the catalogue card gains a size line

Supersedes 0070's card scope (cover, level, title, description only). Each
card now also shows "5 lessons · ~60 min" ("5 уроков · ~60 мин").

- `lib/publicCatalogue.ts` embeds `lessons(estimated_minutes,
  published_version_id, archived_at)` in the existing courses query. It is
  still one query, with no N+1.
- `lib/catalogueSummary.ts` (`summariseLessons`, tested) counts only lessons
  with `published_version_id IS NOT NULL` and `archived_at IS NULL`. It does
  not rely on RLS alone, because "lessons: editor read" (migration 041)
  returns every lesson of a course to a signed-in editor, drafts and
  archived lessons included. This is the same belt-and-braces reasoning 0070
  Decision 1 applied to `status = 'published'` on courses. The two
  conditions mirror the public "lessons: published read" policy (041, as
  amended by 044).
- **Minutes are omitted when any counted lesson has no estimate.** A partial
  sum would understate the course. The real course on the hosted project
  shows "2 урока" with no minutes for exactly this reason.
- Plural agreement ("1 урок / 3 урока / 5 уроков") comes from
  `Intl.PluralRules` via `lib/pluralCategory.ts` (tested). It adds no bundle
  bytes, and no i18n library.
- A course with no cover now shows a brand-gradient tile with its level.
  The old grey "Без обложки" caption read as a broken image in a grid of
  real covers.
- **Still no free/paid badge.** That is entitlement display. It must come
  from the single entitlement function (CLAUDE.md, standing rules) and is a
  separate decision.

## Decision 3 — a tappable mini-demo in the hero

The hero card holds one real `selection` item: `i2` from the `exit-check`
lesson of `authored/courses/future-imperfect.json` ("Humans ___ on the Moon
since 1969."). The first thing a visitor touches is then what a lesson
actually feels like.

- **It is copied into `app/(english)/landingCopy.ts` as marketing copy.**
  Nothing reads the authored file at runtime (docs/handoff.md, failure mode
  "PDF treated as the source of truth"). If the item is edited in the course,
  this copy will not follow. That is acceptable for a promotional excerpt.
- The English "why" is condensed from the item's own explanation. **The
  Russian "why" is a translation written in this session and needs
  owner/partner review before it is treated as final.** So does the rest of
  the new Russian copy.
- It does **not** use `SelectionRenderer`. That would pull lib/items'
  scoring registry in for one hardcoded item, and its separate "Проверить"
  step is one tap more than a demo needs. Tapping an option answers
  immediately, and "Try again" resets.
- The option styling stays identical to the player. `optionClassName` was
  moved verbatim out of `SelectionRenderer.tsx` into
  `app/components/lesson-player/practice/optionClassName.ts`. Both the
  renderer and `HeroDemo` import it by direct path (not the barrel; see
  0059). No class string changed.
- Nothing is recorded. This is not a lesson attempt, and
  `lib/lessonPlayer/attemptStore.ts` never sees it.

## Decision 4 — motion is CSS only

framer-motion is a forbidden signature on English routes (`scripts/
budget.ts` `FORBIDDEN_SIGNATURES`, `eslint.config.mjs`
no-restricted-imports), so all motion is CSS:

- Hero lines stagger in on load using tw-animate-css (`animate-in fade-in
  slide-in-from-bottom-4`, with `delay-*` and `fill-mode-both`). That
  package is already imported globally.
- The word chips bob slowly (`.landing-float`, `app/globals.css`).
- Cards lift on hover, and their covers zoom slowly.
- Sections below the hero fade up on scroll (`.reveal-on-scroll`). This is
  driven by a CSS `view()` scroll timeline, not an IntersectionObserver.
  It is a **progressive enhancement**: the rule lives inside
  `@supports (animation-timeline: view())`. A browser without it (Firefox
  today) never applies the rule and shows the section immediately. Nothing
  is ever hidden waiting for a script, which matters on slow in-app
  browsers.
- Every animation is dropped under `prefers-reduced-motion: reduce`. This
  was verified: the computed `animation-name` is `none` for the h1 and the
  reveal sections with Playwright's `reducedMotion: "reduce"`.

## Decision 5 — `/` budget: pre-existing overage, recovered without raising it

`npm run budget` printed **`/ | 185.0 KB | 180 KB ⚠ OVER BUDGET`** on the
clean tree before this change. The 172.0 KB figure recorded beside the
budget in `scripts/budget.ts` was stale by then. The overage is
pre-existing, not caused here.

After this change:

- **180.3 KB** on the first pass, most likely because `CourseCard` no longer
  imports the whole Russian `alliengllCopy` module into the client bundle.
  That is labelled a hypothesis: the drop was measured, the cause was not
  isolated.
- **179.8 KB** after moving the value strip's four lucide icons out of the
  client component into server-rendered nodes passed as props.

`budgetKB` is unchanged at 180. Only the stale comment beside it was
corrected to the printed figures. The pattern used is that purely
decorative markup (`GradientBackdrop`, `HeroChips`, `valueIcons`) is
rendered by page.tsx (a Server Component) and passed into `LandingContent`
as `ReactNode` props, so it arrives as HTML and costs no client JS.

The headroom is now 0.2 KB. The next addition to `/`'s client tree will
likely cross it.

## Decision 6 — test courses: a dev-only fixture, never committed

The owner asked for throwaway mini-courses to see a fuller grid.
`.env.local` points at the hosted Supabase project, so any published row
would have appeared on live colloquiz.app immediately. Instead, a fixture
file (`app/(english)/devFixtureCourses.ts`) plus a hook in page.tsx appended
seven fake catalogue rows. The hook was gated on `NODE_ENV ===
"development"` and `LANDING_FIXTURE_COURSES=1`. The rows were deliberately
varied: no cover, a reused real cover, a long title, no subtitle, a
200-character subtitle, a 1-lesson course and null minutes. Both the file
and the hook are removed before the commit. Nothing was written to any
database.

## What would make us revisit it

- The partner rejects or rewrites the Russian copy. Copy lives only in
  `landingCopy.ts`, so this is a copy change, not a layout one.
- The demo item changes in the course. Re-copy it, or pick another item.
- `/` crosses 180 KB again. The next lever is to make the EN/RU toggle a
  server re-render (cookie + `router.refresh()`) so `LandingContent` can
  become a Server Component. The trade-off is a round trip on toggle
  instead of the instant switch recorded on 2026-09-28. That needs the
  owner's call.
- A free/paid badge is decided. It goes on the same card, fed from the
  entitlement function.
- Firefox ships view timelines. Nothing to change; the reveal simply starts
  working there.
