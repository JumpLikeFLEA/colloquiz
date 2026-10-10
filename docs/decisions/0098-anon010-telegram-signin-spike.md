# 0098 — ANON-010: Telegram sign-in through OIDC and a Supabase custom provider

Status: DRAFT (uncommitted). Go/no-go: **not decided** — config and device cells are "not tested".

## Context
Card #148. Sources read 2026-10-09: core.telegram.org/bots/telegram-login,
supabase.com/docs/guides/auth/custom-oauth-providers (fetched through a summarising
tool, so exact wording is unverified; re-read the pages before relying on a field name).

## Doc findings (read, not run)
- Telegram: OIDC, issuer `https://oauth.telegram.org`, discovery at
  `/.well-known/openid-configuration`, code flow, PKCE S256 recommended, token endpoint
  needs Basic auth (client id + secret), RS256 default. Scopes: `openid` (required),
  `profile`, `phone`, `telegram:bot_access`. Claims: sub, id, name, given_name,
  family_name, preferred_username, picture, phone_number(_verified). No email claim.
- BotFather: Allowed URLs (origins + exact redirect URIs) are registered in the Login
  Widget section; it shows Client ID / Secret.
- Supabase: custom OIDC providers exist on Free (max 3) and Pro+ (unlimited). Dashboard
  form: identifier (`custom:` prefix), client id, secret, issuer URL, scopes.
  `email_optional`, `pkce_enabled`, `skip_nonce_check`, `discovery_url` are described as
  API options, not dashboard fields. Scopes are configurable per provider.
- Open from the docs alone: (a) whether Supabase sends the secret by Basic auth (Telegram
  requires it); (b) whether `email_optional` can be set from the dashboard or needs the
  management API; (c) whether `telegram:bot_access` passes through; (d) `linkIdentity`
  with a custom provider is undocumented.

## Code audit — email assumed non-null (read, not run)
| Where | What happens with no email |
|---|---|
| lib/auth.ts:40 `authUserFrom` | email `null` already typed; fine |
| lib/signedInAccount.ts:25, app/(english)/AccountMenu.tsx | null handled: person icon + "Signed in" (0086) |
| app/auth/callback/route.ts:13,28-41 | 60 s window uses `user.created_at`, not email; works. Only applies if Telegram returns through /auth/callback (spike uses its own page) |
| supabase/migrations/053_signup_acquisition.sql:81 | 24 h window on `auth.users.created_at`; no email use; works |
| lib/signupAcquisitionServer.ts | `source` comes from the `?source=` query on the callback; the email-confirm path carries it, an OAuth start must thread it itself (as Google/Discord do) |
| app/api/account/export/route.ts:118, lib/accountExport.ts:52,87 | `email: string \| null`; fine |
| app/(colloquiz)/(main)/app/settings/page.tsx:37 | `user.email ?? ""`; fine |
| app/api/account/delete/route.ts | no email use; ban by user id. Erasure message mentions privacy@ only |
| handle_new_user (036/054) | name from raw_user_meta_data (full_name/name), else 'Student'; terms stamped regardless of email. Telegram `name` claim should populate it — unverified |
| ProvidersSection.tsx:24 `PROVIDERS`, :62 `linkIdentity`, :57 | Telegram is not in the list: a Telegram identity renders as no row, but counts toward `isLastMethod`. Needs a row + a `custom:telegram` cast for linking |
| app/api/feedback/route.ts:168 | `submittedBy: user.email` is cosmetic only: it feeds the operator notification in `after()`, which never rejects, so a null email gives a notice without a sender. ANON-012 can fall back to the Telegram username |
| lib/inAppBrowser.ts | hides all OAuth in Instagram/Telegram browsers; Telegram login must be exempted if it works there |

## Account linking (recommendation, to confirm after the spike)
Minimum: in ProvidersSection add a Telegram row using `linkIdentity` (if supported).
Without it, email-less Telegram account + later email sign-in = two accounts. ANON-012 builds it.

## Run lines (owner setup, then session)
Redirect URLs: ONE entry, `https://<branch alias URL>/**` (the branch alias, not a per-deployment URL); removed after the spike.

## Results
| Line | Result |
|---|---|
| Desktop sign-in | not tested |
| identity_data claims (preferred_username?) | not tested |
| `telegram:bot_access` via custom provider / bot can DM | not tested |
| iOS/Android × Telegram/Instagram in-app browsers | not tested |
| Round trip through the real /auth/callback (60 s window, ANON-009 write; spike page prints the signup_acquisitions row) | not tested |
| Delete the Telegram test account via the app's account deletion; show auth.users, auth.identities, signup_acquisitions rows gone | not tested |
| Email-less account through ANON-009/export/delete | read, not run (table above) |
| Linking | read, not run |

## Decision
Pending.
