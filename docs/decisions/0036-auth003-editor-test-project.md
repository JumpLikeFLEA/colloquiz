# 0036 — AUTH-003: a second vitest project for editor component tests

## Context

AUTH-003's acceptance line 3 requires "one test per item type that submits an
invalid form and asserts the rendered error" — a component-rendering
assertion, not a pure-logic one. No React Testing Library / jsdom existed in
this repo before this card (every prior editor test, including AUTH-002's,
tested logic functions like `mapParseErrorsToFieldErrors`, never rendered
JSX — confirmed by grepping for `.test.tsx`, which found only
`lib/inlineMarkup.test.tsx`, itself a markup-parsing test, not a component
one). Adding a component-test library is a new npm dependency, which
CLAUDE.md excludes from `--no-approval` autonomy; the owner was asked and
chose to add `@testing-library/react` + `jsdom`.

`docs/decisions/0004-vitest-scope.md` scoped `vitest.config.mts` to
`lib/**` + `scripts/**`, `environment: "node"`, specifically to keep the unit
suite pure — no jsdom, no React, no database. Its own "what would make us
revisit it" section names exactly this situation: "`scripts/` grows a test
that needs jsdom, React, or a live database — that suite should move to its
own vitest project/config, not loosen this one's `environment: 'node'`."

## Decision

`vitest.config.mts` now declares two projects via Vitest's `test.projects`:

- `unit` — unchanged from 0004: `environment: "node"`, `lib/**/*.test.{ts,tsx}`
  + `scripts/**/*.test.{mjs,js,ts}`.
- `editor` — new: `environment: "jsdom"`, `app/**/*.test.{ts,tsx}`, with a
  `resolve.alias` for `"@"` matching `tsconfig.json`'s path so editor
  component tests can import the same way the app code they test does
  (`@/lib/...`, `@/app/components/...`).

Both run under the same `npm test` — one command, two isolated environments.
`unit`'s "no jsdom, no React, no database" property is unchanged and still
enforced the same way 0004 describes: by the absence of those dependencies
from that project's own test files, not by a directory boundary.

The new test file is
`app/(main)/app/admin/courses/[id]/lessons/[lessonId]/PracticeItemForm.test.tsx`
— one test per item type (`selection`, `selection_grid`, `ordering`,
`matching`, `slots`). Each test takes a real, valid item from
`lib/items/__fixtures__/playgroundExamples.ts`, mutates it into one specific
documented rejection from `docs/decisions/0008`–`0017`, runs the mutated
object through the real `parseItem` (the same function the save route calls),
maps the result through the same `mapParseErrorsToFieldErrors` the editor
uses, and renders `PracticeItemForm` with that item and those errors —
asserting the exact message a real invalid submission would produce appears
in the rendered output. `@testing-library/jest-dom` was deliberately NOT
added: `screen.getByText(...)` already throws if the text is absent, so no
extra matcher library is needed for these five assertions.

## What would make us revisit it

- A third environment need (e.g. a database-backed integration test) should
  get its own project the same way, per 0004's original guidance — not stretch
  `editor`'s jsdom environment to cover it.
- If editor component tests grow common setup (custom matchers, a shared
  render helper), add a `setupFiles` entry to the `editor` project rather than
  duplicating it per test file.
