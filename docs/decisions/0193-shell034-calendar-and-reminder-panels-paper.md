# 0193 — SHELL-034: the calendar, feed and Telegram reminder panels on the paper look

Status: written 2026-10-22 (SHELL-034, #254). No migration, no new token, no hex literal. Behaviour is
untouched: every change is class names behind a new `paper` prop. The card's dependency, PROG-007, was
in Verify; the owner said to treat it as done (this session's instruction), so no satisfaction audit was run.

## Context

0191 and 0192 put every learner page on the grid paper except the three panels on `/my`: the month
calendar, "Subscribe in your calendar" and "Reminders in Telegram" (0159, 0160, 0173). They kept the plain
`border-border shadow-sm` frame between paper-framed sections. All three are shared with Studio, which
stays indigo and unframed (0192 Decision 4, 0156).

## Decisions

1. **A `paper` prop, default `false`.** `CalendarView`, `CalendarFeedPanel` and `TelegramRemindersPanel`
   take `paper?: boolean`. `/my` passes it to all three; the course page passes it to the Telegram panel it
   already renders for an enrolled cohort learner, since that page is paper (0166). Studio's calendar and
   messages pages pass nothing and render the same classes as before (the default branches are the old
   strings, unchanged).
2. **The vocabulary is the one 0192 used.** Panels: `PAPER_PANEL_CLASS` frame; the primary button is
   `OFFSET_CTA_CLASS` (plus `justify-center`, `text-sm`) and the secondary `OUTLINE_CTA_CLASS`; the address
   field takes `border-2 border-ink`. The error line keeps its destructive tokens. Calendar: the month
   table is `border-2 border-ink shadow-offset`, inner lines `border-ink/30`, the nav links `border-2
   border-ink`, "today" is the marker yellow (`bg-highlight text-highlight-foreground`, ink ring) in place
   of the violet disc, each chip gains `border border-ink/30`, and an empty agenda is
   `PAPER_EMPTY_BOX_CLASS`. The chips' fills are unchanged (calls and events brand-tinted, the rest quiet;
   homework stays quiet on purpose, 0152, 0159).
3. **Imports from `app/(english)/surfaceClasses`.** The three components import it directly, as
   `LessonCompletion.tsx` already does; it is a module of string constants. The panels are client components
   and now carry those constants; the effect on the bundle is in the table below.
4. **Not changed:** the month heading and the time-zone line, the panel titles and copy, the agenda's day
   headings, every state machine and fetch.

## Evidence (local stack, `next start` on the unchanged tree and then on this change; demo keys; `VOICE_ANALYSIS_MODE=on`)

- `npm run check` exit 0 (hex-literal guard: 14 files within baseline). `lib/` is untouched, so `npm test`
  was not required.
- `npm run budget`, signed in as the seeded learner (`prog002-learner`, whose `/my` has a call, so the
  calendar and both panels render), before and after:

  | route | before | after | budget |
  |---|---|---|---|
  | `/my` (prog002) | 174.4 | 174.8 | 180 |
  | `/my` (prog007) | 174.4 | 174.8 | 182 |
  | `/courses/coh005-fixture` | 175.4 | 175.4 | 181 |

  "All routes within budget." both times. The +0.4 KB on `/my` is not traced; the likely cause (a hypothesis,
  not measured) is the paper class strings in the two client panels. The course page, which loads only
  the Telegram panel, is unchanged to within 0.1.
- Browser (Edge, `next start`, `scrollWidth/innerWidth`), as `prog002-learner`, November 2026 (the month
  with 5 items; October has none for this learner, so a first pass that read October drew no chips and
  was discarded): 10 chip nodes counted (5 items, in the table and in the agenda), `/my`
  - month with items: 360/360 light, 360/360 dark, 360/360 RU, 1280/1280 light, 1280/1280 dark;
  - an empty month (2099-01): the same five widths, all equal;
  - feed panel, real `/api/calendar-feed`: link shown 360/360, has-token after a reload 360/360 (no
    address shown), replace confirm 360/360, turned off 360/360, in light, dark and RU;
  - feed panel and Telegram panel with the endpoints mocked to fail: the error line 360/360 light and dark
    and 1280/1280 dark; Telegram pending ("Open Telegram" and "Check") 360/360 light and dark, 1280/1280
    dark; the feed's no-link state in the same runs;
  - Telegram panel, real rows: on, on `/my` and on `/courses/coh005-fixture`, then "Turn off" and the
    turned-off line, 360/360 in light, dark and RU.
- Studio, as `hw-teacher` and `play006-editor`: `/studio/calendar` and `/studio/messages` render the feed and
  reminder panels, with 0 `border-ink` / `shadow-offset` nodes in `main` (the same selector finds them on
  `/my`), 1280/1280 light and dark. Screenshot read: the Studio calendar is the plain frame.
- Screenshots read: `/my` calendar at 1280 (light, dark), 360 (light agenda), the feed link shown (dark),
  the replace confirm (light), Telegram pending (light), Telegram on (dark), the feed error (dark).
- Cleanup: the temporary feed token was deleted after each pass (`count(*)` after reads 0) and the
  seeded Telegram row for the learner was set back to its original `stopped_at`.

## Not measured

- Studio's calendar with items: neither Studio account has dates in the month, so the default chip classes
  were checked by reading the diff (the default strings are unchanged), not by a populated render.
- The feed panel's real server error line (it was reached with a mocked 500, as the layout state);
  a phone and an in-app browser; `/my` signed in with an unread-messages dot.

## Revisit when

- Studio moves to the paper: the `paper` prop and its default branch go, as the band tone is going in
  SHELL-035.
