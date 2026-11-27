# 0251 — SHELL-039: tabs across the personal area; Sign out on Settings; Studio on /my

Status: built (#343), 2026-11-27. No migration, no new dependency, no hosted write. AccountMenu is
not touched: until SHELL-040 turns it into a one-tap link to /my, its items exist twice (the card's
stated intent).

## Context

The owner (2026-11-27, option B in chat) will replace the account circle's menu with a labelled link
to /my (SHELL-040). Before that, every item in the menu needs another home, and /my, /my/notebook,
/my/messages and /my/settings need to read as one place rather than four pages joined by back links.

## Decisions

1. **One tab row, `app/(english)/my/MyTabs.tsx`**, a Server Component with plain `next/link` links and
   zero client JS: Overview, Notebook, Messages, Settings (RU: Обзор, Блокнот, Сообщения, Настройки),
   in a `<nav>` named "My learning" / "Кабинет", under `BandTopBar` and above the eyebrow on all five
   /my pages. Strings in `myTabsCopy.ts`, imported only by Server Components (0079 "Budget").

2. **Look: a boxed rail with the current segment in ink** (owner, at the plan checkpoint). Frame
   `rounded-xl border-2 border-ink bg-card p-1 gap-1` (OUTLINE_CTA_CLASS's ink frame around the
   Appearance rail's `p-1 gap-1`), segments `rounded-lg min-h-11 flex-auto`, the current one
   `bg-foreground text-background` (AchievementsView.tsx:187), the rest `text-muted-foreground
   hover:bg-muted`. The plan had violet (`bg-brand text-white`); the owner rejected it because a
   violet-filled rail is LanguageToggle's look (LanguageToggle.tsx:54), and on /my/settings the rail
   sits above the Appearance rail (AppearanceSettings.tsx:118). Both of those are switches; the area
   nav must not read as a third one. Contrast of the current segment, from the rendered colours (both
   neutral greys, a = b = 0, so L* alone fixes luminance): 19.79:1 in light (white on L* 2.75), 18.96:1
   in dark (L* 2.75 on L* 98.26).
   How the rows differ:
   - the area rail: one ink-outlined box with a solid ink segment, at the top of every /my page;
   - the Appearance rail (/my/settings): a thin grey `border-border` box with a pale violet
     `bg-brand-subtle` selection, inside a panel under its own heading, with icons in each option;
   - the notebook's tabs: no box, a 2px ink rule with a violet underline on the current tab;
   - the course chips: separate `rounded-full` pills that wrap, marker yellow when chosen.
   Labels are `text-xs` below `sm`, `text-sm` from `sm` (the plan's fallback for four RU tabs at 360).

3. **The Messages tab is conditional.** Shown when `message_threads('student')` returns a row (a
   conversation or a linked teacher), when `unreadMessages > 0`, or when the current tab is Messages:
   one rule in the component (owner: otherwise /my/messages with no thread would hide the tab of the
   page you are on). /my, /my/messages and /my/messages/[teacherId] pass the thread read they already
   make; /my/notebook and /my/settings add one `failSoft` read, so a failure hides the tab and nothing
   else. With unread replies it reads "Messages (2)" / "Сообщения (2)". Most hobby learners have no
   teacher, and a tab to an empty list would be noise for them.

4. **`prefetch={false}` on the tab links**, as NotebookSections.tsx does. Each tab is a page with its
   own server reads (the notebook view, the threads, the identities), and a view of one should not run
   the others'. That the default would prefetch them is the owner's hypothesis, not measured here.
   Checked once (Edge, local stack): on /my/settings and /my/notebook, hovering every tab sent no
   request to another /my route at all. On /my the log showed prefetches of /my/notebook and of a
   thread, which that page also links from its notebook card and Up next row (Links with the default
   prefetch, unchanged by this card); the tabs' own /my/settings and /my/messages were never requested.

5. **Back links to /my removed** from /my/notebook, /my/settings and /my/messages: Overview replaces
   them. Their `backToMy` strings are deleted. /my keeps "All courses", the thread keeps "← Messages",
   the notebook keeps its download icon.

6. **An "Account" section first on /my/settings** (`AccountSection.tsx`): a `SectionHeading` "Account" /
   "Аккаунт" (a heading the card did not name; added so the section reads like its neighbours), a
   paper panel with "Signed in as <who>" and an `OUTLINE_CTA_CLASS` Sign out, the same plain form POST
   to `/auth/sign-out` with `next="/"`. `who` comes from the new pure `lib/accountWho.ts` (email, else
   @username, else null, shown as "You are signed in"); AccountMenu keeps its own inline copy until
   SHELL-040 deletes the menu. The data section stays last and set apart (0181). The card asked for "a
   test that /my/settings renders the sign-out form"; the page is an async Server Component with five
   server reads, so the test renders `AccountSection`, which the page renders first.

7. **Studio as a row on /my, not a tab** (the default set in chat, kept at the checkpoint): an editor
   gets a `PAPER_CARD_CLASS` row with the `PenTool` tile right after the notebook card, a plain
   `<a href="/studio">` (another root layout, 0109). A tab leaving the area for another layout would
   read oddly, and a fifth tab would not fit at 360 in RU.

## Measured

Local stack (`next start` on the `budget:local` build): `prog007-learner` (no teacher), `hw-student`
(linked to `hw-teacher`, two unread replies seeded for the run and deleted after), `play006-editor`.

- `npm run viewport360`: 26 runs (5 pages for hw-student, 4 for the others, EN and RU), all
  `scrollWidth/innerWidth 360/360`.
- The rail at 360: `ul` 324/324 for every user, page and language, and no label wider than its
  segment. The widest case, RU with four tabs and "Сообщения (2)": segments 54 / 66 / 103 / 81 px. A
  learner with no teacher sees three tabs, the linked learner four; Messages shows on /my/messages for
  the learners with no thread. The Studio row: 1 for the editor on /my, 0 elsewhere and for learners.
- `npm run budget:local` before and after: byte-identical on all 17 routes (/my 179,416 B,
  /my/notebook 173,451 B, /my/settings 205,930 B, /my/messages 180,250 B); `/runs/…f1a1` is over its
  179 KB budget both times (pre-existing).

Not measured: a phone, an in-app browser, dark-mode screenshots (dark was measured for contrast only).

## Revisit if

- A fifth area destination appears: the rail is at 324/324 in RU at 360 with four tabs.
- SHELL-040 lands: the Settings section is then the only sign-out, and `accountWho` the only copy of
  the name fallback.
