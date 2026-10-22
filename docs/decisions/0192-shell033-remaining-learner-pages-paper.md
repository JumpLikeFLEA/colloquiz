# 0192 — SHELL-033: the rest of the learner pages in the Alina Cher look

Status: written 2026-10-22 (SHELL-033, #253). No migration, no new token, no hex literal. Access,
messaging, settings and claiming are untouched: every change is class names and the page chrome.

## Context

0191 moved `/my` and `/runs/[runId]` to the grid paper and listed the five pages a learner reaches
from them that still carried the gradient band: `/my/messages`, `/my/messages/[teacherId]`,
`/my/settings`, `/invite/[token]` and `/join/[token]` (0191 "Not done"; 0166 Decision 1 had named
them). They sat beside paper pages.

## Decisions

1. **The same vocabulary as `/my`, nothing new.** `<main className="grid-paper">`, `BandTopBar` and
   `AccountMenu` with `tone="paper"`, a yellow eyebrow pill (`PAPER_PILL_HIGHLIGHT_CLASS`), the
   `font-display` title, `SectionHeading display`, `PAPER_CARD_CLASS` for a tappable row and
   `PAPER_PANEL_CLASS` for a static card. The message rows' icon tile is the yellow numeral tile
   (`border-2 border-ink bg-highlight`). Padding below the hero is `pt-4`, as `/my` and `/runs`.
2. **Invite and join: one paper panel, the offset button.** The state card is `PAPER_PANEL_CLASS`;
   its primary action is `OFFSET_CTA_CLASS` (the sign-in card on `/runs` uses it) in place of
   `SUBMIT_BUTTON_CLASS`; its secondary action is `OUTLINE_CTA_CLASS` in place of the local
   `SECONDARY_BUTTON_CLASS` (both local copies are deleted); the run and tier pills are
   `PAPER_PILL_CLASS`; the state title is `font-display`. `LinkStatementCard` keeps its `bg-muted`
   box: it sits inside the panel and reads as the statement it is.
3. **Settings: the three cards take the panel frame, the danger zone keeps its tokens.** The
   appearance card, the export card and the sign-in list use `PAPER_PANEL_CLASS` (the sign-in list
   keeps `divide-y divide-border`). The "Data and privacy" rule is now `border-ink` (still
   `border-t-2`). The delete danger zone is unchanged (`border-destructive-border
   bg-destructive-subtle`): it is the one box that must not read as one more card, and the
   destructive set already reads on the paper (checked in a screenshot in dark).
4. **Shared components are not restyled.** `MessageThread`, `MessageComposer` and the attachment
   card are shared with Studio; they keep their own look and sit on the paper as they sat on
   `bg-background`. The calendar, feed and reminder panels are SHELL-034's.
5. **Deleted: `GradientBackdrop` (and its file, `HeroDecor.tsx`), `GRADIENT_BAND_CLASS`,
   `GLASS_PILL_CLASS`, `WHITE_CTA_CLASS`.** `rg` over `app lib scripts` finds no use of any of them
   after this change (`scripts/board/backlog.mjs` and docs mention the names as history). Two comments
   that pointed at them (`AccountMenu.tsx`, `PAPER_PILL_CLASS`) were reworded. `PAPER_EMPTY_BOX_CLASS`
   (the dashed ink box `/my` writes out as a local constant) is new in `surfaceClasses.ts` and used by
   the two message pages; `/my` keeps its own copy, not touched here.
6. **Still unused, not deleted: the `band` tone of `BandTopBar` and `AccountMenu`** (and
   `LanguageToggle`'s default). Every caller now passes `tone="paper"` (`rg` over `app`: 9 `BandTopBar`
   call sites, 0 `AccountMenu` call sites without it, tests aside). They are the default props, so
   removing them changes component signatures and the `AccountMenu` tests; proposed as its own card
   rather than absorbed.

## Evidence (local stack, `next start` on the unchanged tree and then on this change; keys are the public demo ones)

- `npm run check` exit 0 (hex-literal guard: 14 files within baseline).
- `npm run budget`, signed in as the seeded learners, before this change and after:

  | route | before | after | budget |
  |---|---|---|---|
  | `/invite/0000…` | 175.9 | 175.9 | 183 |
  | `/join/0000…` | 175.9 | 175.9 | 183 |
  | `/my/messages` | 175.9 | 175.9 | 184 |
  | `/my/settings` | 199.4 | 199.7 | 208 |
  | `/my` (both) | 174.4 | 174.4 | 180, 182 |
  | `/courses/future-imperfect` | 175.3 | 175.4 | 182 |
  | `/courses/coh005-fixture` | 175.3 | 175.4 | 181 |
  | `/` , `/login`, lessons, `/runs` | unchanged to within 0.1 | | |

  "All routes within budget." in both runs. The 0.1 to 0.3 KB on `/my/settings` is three imports of
  one string module into client components; not traced further. `/my/messages/[teacherId]` has no
  stable entry (the URL carries a per-seed id), so it is measured by the 360px runs only, as 0151 did.
- 360px (`npm run viewport360`, then a scratch Playwright session for the clicks; `scrollWidth/
  innerWidth`), temporary rows seeded for the run and deleted after (see "Cleanup"):
  - `/join/<token>`: signed out 360/360, signed in unlinked 360/360, signed in already linked
    (`--expect="already linked"` passes) 360/360, invalid token 360/360, saved RU 360/360.
  - `/invite/<token>`: signed out 360/360, signed in (pending, "Join the course") 360/360, invalid
    token 360/360.
  - `/my/messages`: with a closed conversation 360/360, RU 360/360, a linked teacher with no
    conversation ("Start a conversation") 360/360.
  - `/my/messages/<teacher>`: a closed thread with a six-message history, a 58-character unbroken word
    and an exercise attachment whose prompt carries a long unbroken word (`--expect` on that word
    passes, so the card rendered) 360/360; a live empty thread with the composer 360/360.
  - `/my/settings`: 360/360 EN, RU, with an Instagram user agent (the "regular browser" note is
    present), with the delete dialog open (dialog x 22, width 316), and `/my/messages` with the
    account menu open 360/360.
  - Screenshots read: thread at 360 (light), settings at 1280 (dark), join at 360 (light).
- Cleanup: the seeded join token, run invite, attachment message and a temporary teacher link were
  deleted; a count after reads `0|0|0|0` (attachments, temp invites, join tokens, the temp link).

## Not measured

- The unlink confirm: the fixture has one sign-in method, so Disconnect is disabled and the dialog
  cannot be opened (it is the same `AlertDialog` frame the delete dialog measured through).
- The invite page's used, expired, revoked and claimed states and the join page's own-link state:
  they share the panel with the states measured and add only a title and a line; not reached.
- A phone and an in-app browser; the composer's error line; the account menu on the invite and join pages.

## Revisit when

- The `band` tone variants are removed (proposed card).
- A teacher-facing page (Studio) moves to the paper: the shared thread and composer would then follow.
