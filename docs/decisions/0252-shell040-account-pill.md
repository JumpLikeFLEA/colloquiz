# 0252 — SHELL-040: the account circle becomes the "My learning" / «Кабинет» pill

Status: built (#344), 2026-11-28. No migration, no new dependency, no hosted write.

Supersedes the menu parts of 0086 (the account chip and its `<details>` card), 0109 Decision 4
(the menu's Studio link), 0120 (the menu's "My courses" link), 0151 (the menu's "Messages (N)"
link; the unread dot stays, on the pill) and 0181 Decision 7 (the menu's Settings link). SHELL-039
(0251) gave each of those items its new home: the /my tabs, Sign out on /my/settings, the Studio row
on /my.

## Context

Owner, 2026-11-27 (option B in chat): the only way into /my was the account circle, then "My
courses": two taps behind an unlabelled control. NN/g found hidden navigation cuts discoverability
almost in half (nngroup.com/articles/hamburger-menus) and advises visible, labelled utilities top
right (nngroup.com/articles/utility-navigation). Those are the owner's sources, cited from the card,
not re-checked here. Sign out moves from one tap (the menu) to three (pill, Settings tab, button);
the owner accepted that on 2026-11-27.

## Decisions

1. **The pill.** `app/(english)/AccountPill.tsx` (renamed from `AccountMenu.tsx`), a Server Component
   with zero client JS: one plain `<a href="/my">` holding the initial circle (`accountInitial`, the
   person icon with no email or username) and the visible label, EN "My learning", RU «Кабинет».
   `min-h-11` (44px), like the back link, so no top bar got taller; a 2px ink outline on `bg-card`,
   `rounded-full`, the brand focus ring. The unread dot stays on the circle. Accessible name: the
   label, plus "Unread messages: N" when N > 0; `title` keeps "Signed in as <who>". On /my,
   `aria-current="page"`. The `<details>`, its full-viewport `::before` layer and the card are gone;
   `accountCopy` keeps `label`, `signedInAs`, `signedIn`, `unreadLabel`. Callers no longer pass
   `next` (sign-out moved to Settings).

2. **Below `sm` the pill is slimmer** (owner, 2026-11-28): circle `size-7` (from `size-9`), gap
   `1.5`, padding `pl-1 pr-2`; the label stays `text-sm` and visible, the tap height stays 44px.
   From `sm` up it is the full size. Measured width at 360: 135px EN, 113px RU.

3. **What yields in a top bar at 360.** The label is never hidden (owner). Measured with only "the
   back link shrinks to its arrow" (Edge, local stack, 360px, signed in):

   | Bar | header scroll/client | page scroll/inner |
   |---|---|---|
   | course and cohort course, EN | 410/328 | 426/360 |
   | course and cohort course, RU | 388/328 | 404/360 |
   | landing, EN | 331/328 | 360/360 |
   | landing RU; lesson; /my pages; /runs; join; invite | 328/328 | 360/360 |

   With the back link removed as well (simulated in the page): course EN 360/328 (32px over), RU
   338/328 (10px over). Course bar contents in EN: wordmark 109 + 12 + toggle 94 + 6 + pill 147 = 368
   against 328.

   Options put to the owner:
   - A. Below `sm`, the pill shows its label only (no circle): about 326 of 328 in EN.
   - B. A smaller pill everywhere: saves about 20px, not enough for EN alone.
   - C. Move the EN/RU toggle out of the course page's top bar below `sm`, into the hero.
   - D. Let the course bar wrap to two rows below `sm`.

   **Chosen: D, plus the slimmer pill** (owner). Not A: its 2px margin was measured in one engine,
   WebKit's text metrics differ, and browser text scaling would overflow it. D is robust to the
   label, the language and the text size; it is the landing's own phone layout; it keeps the back
   link's label and 0080's toggle placement.

   The rule, in `BandTopBar` (one place):
   - a bar where the pill shares the row with a toggle or an action (the course page, the notebook)
     is, below `sm`, a two-column grid: row 1 the wordmark and the pill, row 2 the back link WITH its
     label and the toggle or action. DOM order is the phone's, so focus order matches what is seen;
     `sm:order-*` rebuilds the one row from `sm` up, unchanged;
   - every other bar with the pill (lesson, /my, a thread, /runs, join, invite) stays one row, and
     there the back link shows only its arrow below `sm`, its label kept as `aria-label`;
   - signed-out bars are unchanged.

4. **The landing header is the same two-row grid, signed in and signed out** (owner, 2026-11-28). With
   the pill in the old row 1 (wordmark | toggle + account), the wordmark needed 114px and got 81 (EN) /
   103 (RU), and the tagline needed 121 and got 81 / 103: both wrapped while the header still reported
   `scrollWidth/clientWidth` 328/328. Now: row 1 the wordmark and the account slot (the pill, or "Log
   in"); row 2 the tagline, then the toggle and "Courses". One layout, no order that depends on
   sign-in. `sm:order-*`, `sm:contents` on row 2's group and `sm:gap-x-1.5` with `sm:ml-2.5` margins
   rebuild the old one row from `sm` with its 16px / 6px spacing. This is a visual change to the
   signed-out landing (0165): the toggle moved from row 1 (beside "Log in") to row 2 (beside
   "Courses"). Header height is 90px before and after.

5. **"My courses" as the place's name becomes the label.** Printed before → after:
   - `lib/teacherLinks.ts` leave, EN: "You can leave at any time in My courses." → "… in My
     learning."; RU: «… в разделе «Мои курсы».» → «… в разделе «Кабинет».»
   - `join/joinCopy.ts` alreadyLinked.body, EN "… in My courses." → "… in My learning."; RU «… в
     разделе «Мои курсы».» → «… в разделе «Кабинет».»; the CTA, EN "Go to My courses" → "Go to My
     learning", RU «Перейти в «Мои курсы»» → «Перейти в «Кабинет»».
   - `lib/studioGuide/articles.ts:189`: "on their **My courses** page" → "on their **My learning**
     page".
   - `/my` metaTitle and h1: EN "My courses" → "My learning"; RU «Мои курсы» → «Кабинет». The RU
     eyebrow «Личный кабинет» → «Ваш аккаунт» (owner: it would sit above «Кабинет»); EN "Your account"
     unchanged.
   - `rg -n "My courses|Мои курсы" app lib` after: no hits.

6. **Join and invite: "Not you? Sign out" is a button.** "Sign out from the menu at the top…" was no
   longer true. `app/(english)/SignOutLine.tsx` keeps the sentence with an inline Sign out button: a
   form POST to `/auth/sign-out` with `next` = the same join or invite path, which `safeNext` keeps,
   so the learner comes back to the link signed out and sees its sign-in button. The form wraps the
   sentence (a form inside a `<p>` is invalid HTML). EN "Not you? [Sign out] and sign in with the
   right account."; RU «Это не вы? [Выйдите] и войдите в нужный аккаунт.» (invite is English only).

7. **The regression check is per-row slack, not `scrollWidth`** (owner). `e2e/headerSlack.ts`
   measures each top-bar item's max-content width and, per row, what is left: for a flex bar, the
   header width less the row's needs and gaps; for a grid bar, the header width less every column's
   widest need and the gaps (an `auto` track always widens to its item, so any shortage lands on the
   `1fr` track). `e2e/accountPill.spec.ts` asserts at least 8px on the landing (signed in and out,
   EN and RU) and the course page, in both engines.

## Measured

Local stack (`http://127.0.0.1:54321`), 360px, both phone engines (`npm run e2e`, webkit-iphone and
chromium-pixel), signed in as prog007-learner (no teacher) and hw-student (linked, two unread
replies seeded for the run and deleted after), and signed out. Slack per bar (the smallest row);
WebKit and Chromium printed identical figures, with and without the unread dot:

| Bar | EN | RU |
|---|---|---|
| landing, signed in and signed out (2 rows) | 13 | 23 |
| course page, cohort course page (2 rows) | 55 | 79 |
| notebook (2 rows) | 78 | 101 |
| lesson, /runs (1 row, back arrow) | 20 | 20 (English) |
| /my, a thread (1 row, back arrow) | 20 | 43 |
| /my/settings, /my/messages, join | 70 | 93 |
| invite (English) | 70 | 70 |

The landing, EN: wordmark 114 / track 135, "My learning" 136, tagline 121 / track 135, toggle +
"Courses" 182: 315 of 328.

`npm run viewport360` (Edge, the same build): `scrollWidth/innerWidth` 360/360 on `/`, the course
page, `/my`, `/my/notebook`, `/my/settings`, `/my/messages` and `/join` for prog007-learner (and the
cohort course), hw-student with an unread reply (and the thread) and play006-editor, EN and RU; on the
lesson and `/invite` for all three, and `/runs` for prog007-learner; and on `/` signed out, EN and RU.
`--expect` was the pill's label (or "Log in" / «Войти»).

Screenshots looked at (360, signed out): before, row 1 "Alina Cher" | EN/RU toggle + "Log in", row 2
the tagline | "Courses"; after, row 1 "Alina Cher" | "Log in", row 2 the tagline | toggle +
"Courses"; RU the same with «Войти» / «Курсы». Dark theme, signed in, landing and course page: the
pill's ink outline reads light on the dark ground, the violet circle with the red unread dot, the
label; on the course page row 2 holds "← All courses" and the toggle.

`npm run budget:local` (Supabase: `http://127.0.0.1:54321`, the local stack), HEAD 055cfad before,
this change after, every route in bytes:

| Route | before | after |
|---|---|---|
| /login | 295028 | 295028 |
| / | 196502 | 196519 |
| / (phone) | 189425 | 189442 |
| true-or-false | 266206 | 266206 |
| applied-practice | 294674 | 294674 |
| /courses/future-imperfect | 180701 | 180701 |
| /invite, /join, /completed | 180250 | 180250 |
| /runs/…f1a0 | 186407 | 186407 |
| /my (both entries) | 179416 | 179416 |
| /runs/…f1a1 | 186407 | 186407 (over its 179 KB both times, pre-existing) |
| /my/notebook | 173451 | 173451 |
| /my/messages | 180250 | 180250 |
| /my/settings | 205930 | 205930 |
| /courses/coh005-fixture | 180701 | 180701 |

`/` grew 17 B in both entries: `LandingHeader` renders inside the landing's client component, so its
new classes ship. Every other route, signed in or out, is byte-identical: the pill and the band are
server markup.

`npm run e2e` (both engines): 23 passed, 1 skipped (`lessonNotebook.spec.ts:314`, Chromium-only by
design). `e2e/accountPill.spec.ts`: signed in on a course page, one tap on the pill opens /my
(`aria-current="page"` on it), the tabs reach Notebook and Settings, Sign out lands on / signed out
with "Log in" visible, and every top-bar row on the landing (signed in and out) and the course page
keeps at least 8px, EN and RU.

## Revisit if

- A top-bar label grows (a translated label, a third language) and a row's slack in
  `accountPill.spec.ts` drops under 8px.
- The owner wants Sign out back within one tap.
- A bar gains a third control: the two-row rule covers one toggle-or-action group, not more.
