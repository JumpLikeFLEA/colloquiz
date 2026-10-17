# 0167 — SHELL-031: landing wording from the owner's screenshots

Status: built 2026-10-17. The owner sent their own mockups of the landing hero,
RU and EN, now in `docs/design/alina-cher/owner-landing-hero-{ru,en}.png`. SHELL-027
(0165) had only the picker renders and wrote placeholder copy; this card replaces
the hero's words with the mockups' words. The owner answered the open points in
the session (2026-10-17); each is recorded below.

## Decisions

1. **The hero reads as the mockups, word for word.** Headline "Ты знаешь больше,
   чем можешь сказать" / "You know more than you can say"; subtitle "Короткие
   курсы, которые переводят знания в речь." / "Short courses that turn what you
   know into what you can say."; bio "**Алина.** 10+ лет помогаю взрослым
   заговорить свободно и создаю brain-friendly обучение." / "**Alina.** For 10+
   years I've been helping adults speak English with confidence. I design
   brain-friendly courses."; the social row's label "где я ещё рассказываю про
   мозг и язык →" / "more on brains & language →", now visible text (it was only
   the nav's `aria-label`, "Алина в соцсетях"); the sticker "10–15" large over
   "минут в день" / "minutes a day"; and a new line under the comic, "это
   нормально: понимать и говорить — разные навыки" / "it's normal: understanding
   and speaking are different skills", with lucide's `Brain`. "10+ лет" is the
   owner's own claim about Alina, not a product figure, so 0078's "no unmeasured
   figures" rule does not apply to it.
2. **The oval moves from the tagline to "сказать" / "say"**, and the marker is on
   "больше" / "more". This settles 0165 Decision 3, which built the oval on the
   tagline because the picker render had it there. The tagline is plain text now.
3. **The eyebrow ("Мини-курсы английского · A2–B2") and the "no account" line
   are removed** (owner: agreed). Neither is in the mockups. The cost: the page
   no longer states A2–B2 or that free lessons need no account. 0165 Decision 6
   had moved those claims there from the dropped value strip.
4. **The landing's Russian says "ты".** The mockup headline does, and the owner
   chose "ты" for the page. The sections below the hero keep their wording
   (owner: "Catalogue stays the same"); only the grammatical person changes:
   "Скажи, услышь, сравни", "Запиши голос", "Ответь…", "Получи отклик", "твою
   запись", "Сравни", "запиши… услышь", "загляни позже". Out of scope: the
   account menu's "Вы вошли как" (`accountCopy.ts`, shared with the course page
   and `/my`) and every other route's Russian; proposed as a follow-up card.
5. **Instagram and YouTube carry their marks** (owner: add icons). lucide-react
   1.17 ships no brand icons (`'Instagram' in require('lucide-react')` is false),
   so `SocialIcons.tsx` draws two monochrome `currentColor` outlines on lucide's
   24px grid. The external-link arrow is gone; the link text and underline stay.
6. **Left out on purpose:** "Обо мне" / "About me" and "Отзывы учеников" /
   "Student reviews" from the mockups (0156 Decision 14); the Day 1 / Day 7 audio
   card (SHELL-030). The mockups' layout (the comic's caption cells, the round
   sticker) is not copied: this card is the words.
7. **The headline is server-rendered** (`HeroTitle.tsx`), once per language by
   page.tsx, the `comic` pattern (0165 Decision 9), so its strings and the oval's
   SVG are not in `/`'s client JS.
8. **The sticker sits higher** (`-top-12`, was `-top-8`) and the panel gains
   `mt-4` below `lg`: on two lines it covered "когда" in the second cell at 1440.

## Evidence

- `npm run check` exit 0 (hex-literal guard: 14 files within baseline);
  `npm test`: 129 files, 1500 tests passed.
- `npm run budget` before and after (`.env.local` points at hosted, so these are
  reads of its public pages): `/` 178.2 KB before, 177.9 KB after, of 180. Every
  other route identical: `/login` 287.9, free lesson 257.4, applied-practice
  285.3, `/courses/future-imperfect` 173.0, `/invite` and `/join` 177.0. `/runs`,
  `/my` and `/my/messages` FAIL identically before and after (no fixtures on
  hosted, as in 0165 and 0166).
- `npm run viewport360 -- --expect="You know" /`: `scrollWidth/innerWidth
  360/360`. Playwright on `next dev`, EN and RU by cookie: 360/360, 390/390,
  768/768, 1024/1024 and 1440/1440; the headline's text is "You know more than
  you can say" / "Ты знаешь больше, чем можешь сказать".
- Sticker overlap, measured as box intersection with the two comic captions and
  the social row, at 360, 390, 768, 1024 and 1440 in EN and RU: none. Before the
  fix, the 1440 RU screenshot showed it covering "когда".

## Not measured

- Dark mode, and a signed-in session on `/`.
- The share card and the page's meta description still use
  `alliengllCopy.landing.heroTitle` ("Английский без напряжения"); not in scope.

## Revisit when

- The owner wants A2–B2 or "no account needed" stated on the page again (3).
- The rest of the English surface moves to "ты" (4).
- The owner supplies an About text or reviews (6).
