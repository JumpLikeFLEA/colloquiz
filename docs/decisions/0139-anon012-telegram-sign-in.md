# 0139 — ANON-012: Telegram sign-in button

## Context

Card #166. ANON-010 (docs/decisions/0098) said go for desktop, with
in-app-browser device cells deferred to a production pass by the owner. Owner
answers, 2026-10-14: a full-width Telegram button above the Google/Discord
pair; a new `--telegram` colour token; phones tested on production after
this ships; deletion checked by reading the code only.

## Decisions

1. **One provider type.** `OAuthProvider` (`lib/authRedirect.ts`) is
   `"google" | "discord" | "custom:telegram"`, used by AuthScreen,
   RegistrationOffer, ProvidersSection and `oauthQueryParams`. Telegram gets
   no extra query params: its consent page already names the account.
2. **Per-provider in-app rule.** `isOAuthProviderAvailable(provider, ua)` in
   `lib/inAppBrowser.ts` offers a provider in an Instagram or Telegram webview
   only if it is on `WORKS_IN_IN_APP_BROWSER`, which is empty. So in an in-app
   browser the registration offer still shows no OAuth button, and its notice
   now names all three. AuthScreen keeps not filtering by user agent, which
   is how the owner's phone pass reaches the button.
3. **Placement.** Telegram is a full-width button above the existing
   two-column Google/Discord row, on AuthScreen (both panels) and in the
   registration offer, grouped with that row at `gap-3`. Its label is
   "Continue with Telegram"; Google and Discord keep their one-word labels.
4. **Colour.** `--telegram: #2aabee` in `:root` and `.dark` (a brand colour,
   the same in both), mapped as `--color-telegram`. `TelegramIcon` is
   simple-icons' path (CC0) in `text-telegram` with `fill="currentColor"`;
   the plane is cut out of the circle, so it shows the button's surface.
   No hex literal outside globals.css.
5. **Linking** (0098 Decision 2): a Telegram row appended to ProvidersSection
   (appended so existing lists keep their order), with Connect through
   `linkIdentity`. A connected row names `@preferred_username` when the
   identity has no email.
6. **`email: ""` is `null`.** `authUserFrom` uses `||`, so an account without
   an email has one "no email" value everywhere it is read (0098: the JWT
   carries `""`, and the export printed it).
7. **Legal.** privacy-policy.md (1.4) and subprocessors.md (1.2) drop
   "profile picture" from Telegram's fields and name the identifier for what
   it is (0098 Decision 3). subprocessors.md names Telegram Messenger Inc.
   and its EEA representative, and its transfer basis is the owner's call.

8. **The auth form column centres with `my-auto`, not `items-center`.** The
   right panel was `flex items-center … overflow-y-auto`. A flex item taller
   than its container overflows above the top when centred there, and that
   part can't be scrolled to. Measured on `/signup?next=<lesson>` with the
   Telegram row in (Edge via Playwright, `next dev`):
   - the form's top was at −123 px at 360×800 (logo and heading unreachable);
   - it was at −35 px at 1440×900 (heading hidden).

   It was already cut before this card: by about 94 px and 6 px, computed
   from the same heights minus the 58 px row. Auto margins drop to 0 when
   there is no free space. After the change the form top is 48 px (the
   panel's `py-12`) at both sizes, and `/login` sits where it did (127 px
   and 147 px). ResetPasswordScreen has the same container but a short form,
   and is left alone.
9. **RegistrationOffer loads lazily** (`next/dynamic`, `ssr: false`, from
   LessonCompletion), because the acceptance asks for no change to an
   anonymous visitor's critical path. With it static, the Telegram icon and
   button added 0.5 KB to every lesson (`npm run budget`):
   - `true-or-false` went from 261.8 to 262.3 KB, already over its 260 KB
     budget before this card;
   - `applied-practice` went from 289.8 to 290.3 KB, newly over its 290 KB
     budget.

   The offer only renders after a completed lesson, which is client state, so
   loading it then costs the learner nothing on first load. The figures after
   this change are in #166's closing comment.

## Not done here

- A Telegram learner's username in Studio (roster, learner page, review
  queue): proposed as its own card. It needs a migration, because those
  RPCs read `auth.users.email`.
- Showing Telegram inside in-app browsers: a follow-up commit after the
  owner's phone pass, with that pass's results in 0098.

## Revisit if

- The phone pass shows Telegram working in an in-app browser: add it to
  `WORKS_IN_IN_APP_BROWSER` and reword the registration offer's notice.
- A fourth provider arrives: the Telegram row's full-width treatment was
  chosen for one featured provider, not as a pattern.
