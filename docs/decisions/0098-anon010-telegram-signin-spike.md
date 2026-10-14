# 0098 — ANON-010: Telegram sign-in through OIDC and a Supabase custom provider

Status: decided 2026-10-14. **Go** for desktop. The in-app-browser device
cells are filled by the owner on production after ANON-012 ships (owner,
2026-10-14); until then Telegram stays hidden in the in-app registration offer.

## Context

Card #148. Sources: core.telegram.org/bots/telegram-login and
supabase.com/docs/guides/auth/custom-oauth-providers, read 2026-10-09 and
re-read 2026-10-14 (through a summarising fetch, so exact wording is
unverified). The 2026-10-09 draft of this file held the doc findings and the
code audit below with every result "not tested". The results here come from
a run on 2026-10-14: `next dev` on localhost:3000 against the hosted project,
the owner signing in from desktop Chrome on Windows through a throwaway page
(`/spike/telegram`, restored from `f8bfff5` as an untracked file, never
committed, deleted after the run).

## Configuration (as done)

1. **BotFather, @Alliengll_bot, Web Login → Allowed URLs:** the redirect URL
   `https://kumrlovftctxcbbbmnfy.supabase.co/auth/v1/callback`, plus a
   trusted origin (the spike-branch alias, being replaced by
   `https://colloquiz.app`). BotFather refuses `localhost` as an origin, and
   no localhost entry is needed: on the consent page Telegram's own URL
   carried `origin=https://kumrlovftctxcbbbmnfy.supabase.co` (owner's
   screenshot, 2026-10-14), and the round trip back to localhost worked.
   BotFather shows the client id (`8866306463`) and secret.
2. **Supabase dashboard → Authentication → Sign In / Providers:** custom
   provider `custom:telegram`, enabled, with that client id and secret and
   issuer `https://oauth.telegram.org`. Printed 2026-10-14 (`curl` of
   `/auth/v1/authorize?provider=custom:telegram`, redirect not followed):
   302 to `https://oauth.telegram.org/auth` with `code_challenge_method=S256`,
   `redirect_uri=https://kumrlovftctxcbbbmnfy.supabase.co/auth/v1/callback`
   and `scope=openid openid profile telegram:bot_access`. So Supabase does
   PKCE and passes `telegram:bot_access` through.
3. **Supabase → Authentication → URL configuration:** redirect URLs include
   `http://localhost:3000/**` (the run returned to localhost) and
   `https://colloquiz.app/**`. The spike-branch entry is removed.
4. Code: `signInWithOAuth({ provider: "custom:telegram" })`. supabase-js
   2.108.1's `Provider` type includes `` `custom:${string}` ``
   (`node_modules/@supabase/auth-js/dist/module/lib/types.d.ts:13`), so no
   cast is needed.

## Results

| Line | Result |
|---|---|
| Desktop sign-in | **Works.** Telegram's page reads "Log in with Telegram. The website will receive your Name, Username and Profile Photo", then "Continue with Telegram", then back on `/spike/telegram` signed in. |
| Claims in `identity_data` | `sub`, `name`, `given_name`, `family_name`, `preferred_username`, `iss`, `aud`, `iat`, `exp`, plus `email_verified: false`, `phone_verified: false` (from Supabase). **No `picture`** (despite the consent page) and **no `id`**. `user_metadata` is the same object. `email` and `phone` on the user are `""`, not `null`. |
| `telegram:bot_access` | Requested (row 2 of the configuration), but the consent page asked nothing about the bot messaging the owner (owner, 2026-10-14). `sendMessage` with `chat_id` = `sub` (`15027785433728414161`) returned `400 Bad Request: chat not found`. That `sub` is above the int64 maximum (9223372036854775807), so it cannot be a Telegram chat id; it is a pseudonymous per-client id. Nothing Supabase stores identifies the learner to the bot. |
| `/start` deep link (COH-006 input) | `https://t.me/Alliengll_bot?start=anon010`, Start, then `sendMessage` with `chat_id` = the `from.id` of that update in `getUpdates`: `ok: true`, `message_id: 2`. The update's text (`/start anon010`) was not printed. |
| iOS/Android × Telegram/Instagram in-app browsers | **Not tested.** Owner, 2026-10-14: run on production after ANON-012 ships, on `/login?next=<lesson>` (AuthScreen does not filter by user agent, so no code change is needed to run it). |
| `/auth/callback`'s 60 s window and ANON-009's write | The account was created on 2026-10-09 by the first spike run (`created_at 2026-10-09T12:01:54.26802Z`), whose `signup_acquisitions` row is `source: telegram`, `course_id: null` (the `next` was `/spike/telegram`, not a course), `created_at 2026-10-09T12:01:55.744241Z`, 1.5 s later. The 2026-10-14 sign-in was a returning one, so the new-account path was not re-run on main; since 2026-10-09 `app/auth/callback/route.ts` changed only in `49022e4` (SHELL-021, the editor landing), which `git log --since=2026-10-09` prints. |
| 0081 Decision 3's 24 h window | Same row: written 1.5 s after the account. |
| Terms acceptance | `profiles.terms_accepted_at 2026-10-09T12:01:54.25416Z`, `terms_version 1.1`. |
| Profile name | `display_name` and `full_name` "Gleb Chernov", from the `name` claim through `handle_new_user` (054). |
| Account export | Works. `GET /api/account/export` as the Telegram account: `meta.account_id` is the account, `meta.email` is `""`, `meta.format_version` 8, and the `profile` section has the name above and `avatar_url: null` (owner's paste, 2026-10-14). |
| Account deletion | Read, not run (owner, 2026-10-14). `app/api/account/delete/route.ts` anonymises and bans by user id and never reads the email. Consequence: a banned user keeps its `custom:telegram` identity, so that Telegram account can never sign in again, the same as a Google account today (ADR 0002). That is why the owner's only Telegram account was not used. |
| Linking | Read, not run (owner, 2026-10-14). The owner's Telegram identity belongs to the 2026-10-09 account, and freeing it would take a hard delete on the hosted project. |

## Code audit — an email-less account (read 2026-10-09, still current)

| Where | What happens with no email |
|---|---|
| `lib/auth.ts` `authUserFrom` | `email: claims.email ?? null`. The JWT carries `""`, and this passes it through: the export route reads its email from here and printed `""` (row "Account export"). Readers that test truthiness treat `""` as no email; the export prints it. ANON-012 normalises `""` to `null` here, so "no email" has one value. |
| `lib/signedInAccount.ts`, `app/(english)/AccountMenu.tsx` | Truthiness: person icon + "Signed in" (0086). |
| `app/auth/callback/route.ts` | The 60 s window uses `user.created_at`, not the email. |
| `053_signup_acquisition.sql` | 24 h window on `auth.users.created_at`. |
| `lib/signupAcquisitionServer.ts` | `source` comes from `?source=` on the callback; an OAuth start threads it (as Google and Discord do). |
| `app/api/account/export/route.ts`, `lib/accountExport.ts` | `email: string \| null`. |
| `app/(colloquiz)/(main)/app/settings/page.tsx` | `user.email ?? ""`. |
| `app/api/account/delete/route.ts` | No email use. |
| `handle_new_user` (054) | Name from `full_name`/`name`; terms stamped regardless of email. Proven above. |
| `ProvidersSection.tsx` | Telegram not in `PROVIDERS`: a Telegram identity renders no row but counts toward `isLastMethod`. Needs a row. |
| `app/api/feedback/route.ts` | `submittedBy: user.email` feeds an operator notice that falls back to the user id (`lib/feedbackNotify.ts:76`). |
| `lib/inAppBrowser.ts` | Hides all OAuth in Instagram and Telegram webviews; becomes per provider in ANON-012. |

## Decision

**Go.** ANON-012 builds the button on AuthScreen and in RegistrationOffer.

1. **In-app browsers.** RegistrationOffer keeps Telegram hidden in Instagram
   and Telegram webviews until the owner's production pass proves it there;
   one follow-up commit then opens it where it worked.
2. **Minimum linking path:** a Telegram row in `/app/settings`
   ProvidersSection with Connect through
   `linkIdentity({ provider: "custom:telegram" })`. It serves the learner who
   has an email account and adds Telegram before ever signing in with it.
   Not run live (row "Linking"). If the Telegram identity already belongs to
   another account, linking fails and nothing merges the two: a learner with
   two accounts is a support case, not a flow. ANON-012's live check runs
   Connect once and records what happens.
3. **Legal text.** privacy-policy.md:59 and subprocessors.md:23 list "profile
   picture" as a received field; Telegram returns none (row "Claims"). The
   identifier received is a pseudonymous `sub`, not the Telegram account id.
   ANON-012 corrects both lines and fills subprocessors.md:23's entity and
   transfer cells (Telegram Messenger Inc.; EEA representative EDPO, Brussels,
   per telegram.org/privacy, changelog 2026-08-21), for the owner's sign-off.
   Under 0095, removing a field that was never received is not material.
4. **The bot reaches learners through a `/start` deep link, not through
   sign-in.** `telegram:bot_access` gave no consent prompt and no usable chat
   id. COH-006 takes this as settled input. The scope can be dropped from the
   provider's configuration (owner, dashboard); it is harmless while it
   stays.

## Revisit if

- Telegram adds the account `id` to the ID token, or Supabase starts storing
  it: the bot could then message a learner who signed in with Telegram.
- The production device pass shows Telegram sign-in failing in an in-app
  browser: it stays hidden there, and the registration offer's notice says so.
- A learner turns up with two accounts (Telegram and email): a merge path
  becomes worth building.
- Telegram's consent page starts asking about bot messages: re-test row
  "`telegram:bot_access`".
