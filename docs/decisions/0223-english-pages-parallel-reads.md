# 0223 — English pages: independent reads start together (SHELL-037)

## Context
The lesson page, the course page and `/my` awaited reads one after another that
need nothing from each other (project review, 2026-11-02; issue #275). `/my`
also carried five copy-pasted try/catch "courtesy" wrappers, and
`<AccountMenu>` was spelled out field by field at 11 call sites.

## Decisions
1. **Stages, not one big `Promise.all`.** A read starts as soon as everything it
   needs is known. Lesson page: `[lesson, course, account]`, then (playable
   lesson) `[homework, ask-the-teacher, earlier attempts, best-score summary,
   next course, voice context]`. A paid or sign-in lesson still reads only the
   homework pill. Course page: `[course, account, language cookie]`, then
   `[attempts, cohort]`, then `[Telegram link, last-opened lesson, next
   course]`. `/my`: the eight reads plus the account in one `Promise.all`.
   Each read is still made only for who needed it before (an anonymous visitor
   pays for no learner read; Telegram only for an enrolee; the next course only
   for a finished or fully-open course).
2. **Accepted cost:** a request for a lesson slug or course slug that does not
   exist now also reads the account (and, for a lesson, the course) before its
   404. An anonymous 404 costs no network call for the account
   (`lib/signedInAccount.ts`).
3. **`lib/failSoft.ts`** — `failSoft(label, read, fallback)` logs
   `console.error(label, err)` and returns the fallback. It replaces `/my`'s
   five wrappers and the lesson page's two inline catches. Strict reads (the
   learner home, teachers, ask-the-teacher, voice context, next course) stay
   strict.
4. **`AccountMenu` takes `account: SignedInAccount`** (the type
   `getSignedInAccount` returns, now exported) instead of four props.

## Evidence
Server render time, local production build against the local stack, `fetch` to
full body, 1 discarded warm-up then 10 loads, median (min–max), ms:

| page | before | after |
|---|---|---|
| free lesson, anonymous | 63 (53–77) | 42 (37–56) |
| free lesson, signed in | 69 (60–91) | 58 (49–60) |
| course page, anonymous | 28 (24–35) | 26 (23–33) |
| course page, signed in | 45 (39–74) | 33 (31–38) |
| `/my`, signed in | 70 (61–99) | 66 (58–76) |

`npm run budget`, local-stack build before (reused build) and after (rebuilt):
all 16 rows identical (`diff` of the printed KB columns is empty), e.g. `/`
191.9 / 191.9, the free lesson 259.8 / 259.8, `/my` 175.2 / 175.2. The one
OVER BUDGET line, `/runs/…f1a1` (180.8 KB of 179), is the same before and after.
(An earlier "after" run built against `.env.local`'s hosted URL read 289.2 KB
for `/login` and 404'd the fixtures; it is not comparable and was discarded.)

## Revisit if
The 404-path extra reads show up as load on bad URLs, or a stage needs a read
that depends on a later one.
