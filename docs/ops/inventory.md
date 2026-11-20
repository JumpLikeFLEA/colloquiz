yes (commented out)

MIG-001 (#294), read 2026-11-14. The input to MIG-019, which checks the new home
against every line here (docs/decisions/0226 facts 10 and 13).

A clone of this repo plus a copy of the database does **not** carry anything below.
Each line says how it was read:

- **probe** — a read-only command whose printed output is in #294's evidence
  comment. The commands are under "How to re-read" at the end.
- **repo** — read from a tracked file (named), which a clone does carry, but which
  only works if the outside setting it points at exists.
- **owner, <date>** — the owner read it from a dashboard (checklist step Z4).
  **owner, pending** means not yet attested.

No secret value appears in this file. Secret-bearing settings are listed by name only,
marked *(secret, not printed)*.

## Supabase (project `kumrlovftctxcbbbmnfy`, name `colloquiz`)

### Project

| Setting | Value | How read |
|---|---|---|
| Region | `eu-west-1` | probe (`GET /v1/projects/{ref}`) |
| Postgres | 17.6 (`17.6.1.127`, engine 17, channel ga) | probe (`/v1/projects/{ref}`; `select version()`) |
| Created | 2026-06-11 | probe |
| Organisation id | `tnjpcugmqrrtbyzrnrqq` | probe |
| Plan | Free | owner, 2026-11-12 (0226 fact 18). The access token gets 403 on `/v1/organizations/{id}`, so the API could not confirm it |
| Add-ons | none | probe (`/billing/addons`: `selected_addons: []`) |
| Custom domain | none | probe (`/custom-hostname`: 400, no hostname configured) |
| Network restrictions | open (`0.0.0.0/0`, `::/0`) | probe |
| SSL enforcement (DB) | off | probe |

### Auth providers

| Provider | State | How read |
|---|---|---|
| Email (password) | enabled; magic link not disabled | probe (`external_email_enabled`, `external_email_magic_link_disabled`) |
| Google | enabled, client id `369070551050-388d3sp1rle6pstv0d9q2pfrdboo45rv.apps.googleusercontent.com`, nonce check on; secret *(secret, not printed)* | probe |
| `custom:telegram` | enabled; client id `8866306463`; issuer `https://oauth.telegram.org` (0098); secret *(secret, not printed)*. **The new project's provider must have exactly this name and client id** (0226 fact 9) | probe: 0098's authorize URL, redirect not followed, printed `302` to `oauth.telegram.org/auth?client_id=8866306463`, `scope=openid openid profile telegram:bot_access`. Not in `/config/auth` (that response reports `custom_oauth_enabled = false`, which does not describe this provider); the issuer is from 0098 |
| Discord | **disabled** (0221); a client id and secret are still stored in the dashboard | probe (`external_discord_enabled = false`). Not to be recreated |
| Phone, anonymous, every other provider, SAML, web3, passkey | off | probe |

### URL configuration

| Setting | Value | How read |
|---|---|---|
| Site URL | `https://colloquiz.app` | probe (`site_url`) |
| Redirect allow-list | `http://localhost:3000/**`, `https://colloquiz.app/**`, `https://colloquiz.app/auth/confirm**`, `https://colloquiz.app/auth/callback**` | probe (`uri_allow_list`) |

### SMTP (Resend)

| Setting | Value | How read |
|---|---|---|
| Host / port | `smtp.resend.com` / `465` | probe |
| User | `resend` | probe |
| Password | *(secret, not printed: a Resend API key)* | — |
| Sender | `noreply@colloquiz.app`, name `Colloquiz` | probe (`smtp_admin_email`, `smtp_sender_name`) |
| Min interval between mails to one user | 60 s | probe (`smtp_max_frequency`) |

### Email templates and subjects

Two templates are customised on hosted; every other template is Supabase's default
(173–270 characters, using `{{ .ConfirmationURL }}`). Both custom ones are committed
and wired in `supabase/config.toml`, so the local stack sends them too.

| Template | Subject (hosted) | In repo | How read |
|---|---|---|---|
| Confirmation | "Confirm your email address" | `supabase/templates/confirmation.html` | probe: hosted 3,541 chars, sha256 `3c5c44fc8b5cff31…`; repo file the same hash; the local stack serves the same hash |
| Recovery | "Reset your password" | `supabase/templates/recovery.html` | probe: hosted 3,546 chars, sha256 `73449ba117478350…`; repo and local stack the same hash |
| Email change, invite, magic link, reauthentication, the six notification templates | Supabase defaults (subjects in the evidence) | not committed (defaults) | probe (lengths and hashes printed) |

Both custom templates link to `{{ .SiteURL }}/auth/confirm?token_hash=…`, so the new
project's Site URL decides where they point. They carry the Colloquiz name and the
indigo colours: a Stage 2 change (MIG-022).

### Password, sign-up, sessions, MFA

| Setting | Value | How read |
|---|---|---|
| Sign-up | open (`disable_signup = false`) | probe |
| Email confirmation | required (`mailer_autoconfirm = false`). The local stack has `enable_confirmations = false` in `config.toml`: a deliberate local difference, not a hosted setting | probe; repo |
| Unverified email sign-ins | off | probe |
| Secure email change | on | probe |
| Email OTP | 8 digits, 3,600 s | probe |
| Password | minimum length 8, no required characters, leaked-password check off | probe (`password_min_length`, `password_required_characters`, `password_hibp_enabled`, read by name: the first filter's deny pattern `pass` also dropped these keys) |
| Update password needs current password / reauthentication | off / off | probe |
| JWT expiry | 3,600 s | probe |
| Refresh token rotation | on, reuse interval 10 s | probe |
| Sessions | no timebox, no inactivity timeout, not single-per-user | probe |
| Manual identity linking | off | probe |
| MFA | TOTP on (enrol and verify), phone and WebAuthn off, max 10 factors | probe |
| Captcha | off (provider field `hcaptcha`, unused) | probe |
| Auth hooks | none enabled | probe |
| Security notification emails | all off | probe |

### Rate limits (Auth)

| Limit | Value | How read |
|---|---|---|
| Emails sent | 30 / h | probe (`rate_limit_email_sent`) |
| Token refresh | 150 | probe |
| Verify | 30 | probe |
| OTP | 30 | probe |
| Anonymous users | 30 | probe |
| SMS | 30 | probe |
| Web3 | 30 | probe |

### Storage

Global upload limit: 50 MB (`fileSizeLimit` 52,428,800); image transformation on;
S3 protocol on. Probe (`/config/storage`).

| Bucket | Public | Size limit | MIME types | How read |
|---|---|---|---|---|
| `avatars` | yes | 2 MB (2,097,152) | image/png, image/jpeg, image/webp | probe (`storage.buckets`) |
| `course-imports` | no | 32 MB (33,554,432) | application/pdf, …wordprocessingml.document, text/markdown, text/plain | probe |
| `lesson-images` | yes | 5 MB (5,242,880) | image/png, image/jpeg, image/webp, audio/mpeg, audio/mp4, audio/x-m4a, audio/aac | probe |
| `voice-recordings` | no | 10 MB (10,485,760) | audio/webm, audio/ogg, audio/mp4 | probe |

The migrations create these buckets and their policies. The objects in them are in
no database copy (0142, 0226 fact 11).

### Extensions

`pg_cron` 1.6.4, `pg_stat_statements` 1.11, `pgcrypto` 1.3, `plpgsql` 1.0,
`supabase_vault` 0.3.1, `uuid-ossp` 1.1. Probe (`pg_extension`). Vault holds 0
secrets (probe, `count(*)`).

### pg_cron jobs

| Job | Schedule (UTC) | Command | Created by | How read |
|---|---|---|---|---|
| `expire-duels` | `*/2 * * * *` | `select public.expire_duels();` | migration 033 | probe (`cron.job`) — **quiz-only** |
| `purge-unclaimed-run-invites` | `23 3 * * *` | `select public.purge_unclaimed_run_invites();` | migration 059 | probe |

A schema-only copy plus data does not necessarily copy `cron.job` rows; replaying the
migrations does.

### Realtime

Publication `supabase_realtime`: `public.notifications` only (migration 018,
**quiz-only**: duels). The `supabase_realtime_messages_publication` partitions are
Supabase's own. Max concurrent users 200. Probe (`pg_publication_tables`,
`/config/realtime`).

### API (PostgREST)

Exposed schemas `public, graphql_public`; extra search path `public, extensions`;
max rows 1,000. Probe (`/postgrest`).

### Keys

The anon key, service-role key and JWT secret are *(secret, not printed)*. They are
not carried to the new project (0226, "JWT secret"); the new ones go into Vercel.

## Vercel (project `colloquiz`, `prj_jSyIjNzCluBBBoJiDJD9HqiuMhZL`, team `team_BeTXv4xZwi5dLFR59TE5RTru`)

CLI pinned to `vercel@65.16.0` (resolved 2026-11-14 with `npx vercel@latest
--version`), run through `npx`, never installed. Read-only subcommands only.

| Setting | Value | How read |
|---|---|---|
| Region | `dub1` | repo (`vercel.json`) |
| Crons | `voice-purge` `41 3 * * *`, `voice-analysis-sweep` `47 3 * * *`, `telegram-reminders` `17 7 * * *`, `course-import-sweep` `53 3 * * *` | repo (`vercel.json`). All four refuse every request without `CRON_SECRET` (0226 fact 13) |
| Web Analytics | wired in `app/(colloquiz)/layout.tsx` only (`<Analytics />`); not on the English surface (OPS-008) | repo. Whether it is switched on in the dashboard: owner, pending |
| Speed Insights | wired in `app/(english)/layout.tsx` (`<SpeedInsights />`) | repo. Dashboard switch: owner, pending |
| Environment variable names per environment | see the "Vercel" column of the table under "Environment variable names" | probe (`vercel env ls`, see the note below) |
| Domains | `colloquiz.app`, registrar and nameservers "Third Party" (Porkbun, below), added 118 days before 2026-11-14 | probe (`vercel domains ls`: 1 domain) |
| Account / team | `jumplikeflea`, team `jumplikefleas-projects` | probe (`vercel whoami`, `teams ls`) |
| Plan | Hobby | probe (`vercel teams ls`, Plan column) |
| Project | `colloquiz`, production URL `https://colloquiz.app`, Node 24.x | probe (`vercel project ls`) |

`vercel env ls` (2026-11-14): the raw output went to a scratch file that was read only
for its shape and then deleted. 14 rows showed the value as `hidden`, type `secret`; 4
(`COURSE_IMPORT_MODE`, `VOICE_ANALYSIS_MODE`, `VOICE_ANALYSIS_MODEL`,
`NEXT_PUBLIC_SENTRY_DSN`) carry a non-secret type with a value cell, so per the
owner's rule no line of the raw output was printed. Names and environments are from
that shape-only pass; the owner accepted them as they are (2026-11-14). No value of
any variable is recorded anywhere.

## Telegram (BotFather, `@Alliengll_bot`)

| Setting | Value | How read |
|---|---|---|
| Web Login client id | `8866306463` | probe (the authorize redirect above) |
| Web Login allowed URLs | `https://kumrlovftctxcbbbmnfy.supabase.co/auth/v1/callback` and trusted origin `https://colloquiz.app` | repo (0098 "Configuration" item 1); owner, pending |
| Webhook | `https://colloquiz.app/api/telegram/webhook` with a secret token (`TELEGRAM_WEBHOOK_SECRET`) | repo (`app/api/telegram/webhook/route.ts`, 0173). The live `getWebhookInfo` needs the bot token, which is not in `.env.local`: owner, pending |
| Display name, description, picture, commands | — | owner, pending |
| Bot token | *(secret, not printed)* | — |

## Google Cloud (OAuth client for Supabase's Google provider)

Client id as above. Authorised redirect URI (expected
`https://kumrlovftctxcbbbmnfy.supabase.co/auth/v1/callback`), authorised JavaScript
origins, consent screen name, logo, support email and publishing status: owner,
pending.

## Resend

Sending domain `colloquiz.app`, region eu-west-1 (the `send.` MX points at
`feedback-smtp.eu-west-1.amazonses.com`). Domain records: probe (DNS, below). The API
key in use as the SMTP password, and the account owner: owner, pending.

## Porkbun (registrar and DNS for `colloquiz.app`)

Probe: public DNS through `dns.google`, 2026-11-14.

| Record | Value |
|---|---|
| NS | `curitiba`, `fortaleza`, `maceio`, `salvador` `.ns.porkbun.com` |
| A `colloquiz.app` | `216.198.79.1` (Vercel) |
| CNAME `www` | `835efb17edece8da.vercel-dns-017.com.` |
| MX `colloquiz.app` | `fwd1.porkbun.com` (10), `fwd2.porkbun.com` (20): Porkbun email forwarding |
| TXT `colloquiz.app` | `v=spf1 include:_spf.porkbun.com ~all` |
| TXT `resend._domainkey` | DKIM public key (218 chars) |
| MX `send` | `feedback-smtp.eu-west-1.amazonses.com` (10) |
| TXT `send` | `v=spf1 include:amazonses.com ~all` |
| TXT `_dmarc` | `v=DMARC1; p=none;` |
| AAAA, CAA | none |

Email forwarding rules (where `privacy@colloquiz.app` and any other address go), the
renewal date and auto-renew: owner, pending.

## AssemblyAI

Speech-to-text for voice analysis (`lib/voice/analysis/server.ts`,
`ASSEMBLYAI_API_KEY`). Account, region (EU endpoint or not), plan and data-retention
setting: owner, pending.

## Anthropic

Voice analysis, course import and the quiz generator (`ANTHROPIC_API_KEY`). The
organisation, spend limit, workspace and data-retention setting: owner, pending.
Account deletion calls the Files API to remove a deleted user's import files
(`app/api/account/delete/route.ts`).

## Discord feedback webhook

Removed by OPS-040 (#319), owner 2026-11-14; not recreated. The code, the variable in `.env.example` and the
subprocessors row are gone (docs/decisions/0232). After the push the owner deletes the Vercel variable, then the
webhook in Discord, in that order. New feedback is seen only by opening `/app/admin/feedback`.

## GitHub

| Setting | Value | How read |
|---|---|---|
| Repo | `JumpLikeFLEA/colloquiz`, public | probe (`gh repo view`) |
| Project board | #2 "Colloquiz" (user project of `JumpLikeFLEA`), 275 items; Status options Ready, In progress, Hold, Verify, Done | probe (`gh project field-list`, `item-list`). Ids are in `scripts/board/config.mjs` |
| Board workflows (a push closing an issue moves it to Done) | — | owner, pending: not readable through `gh` |
| Actions secrets | none | probe (`gh api …/actions/secrets`: empty) |
| Repo webhooks | none | probe (`gh api …/hooks`: empty) |
| CI | `.github/workflows/ci.yml` | repo |

Labels and milestones live in the repo and move with a transfer (0226 assumed
decision E).

## Environment variable names

Reconciled against
`rg -o --no-filename "process\.env\.[A-Z0-9_]+" app lib scripts proxy.ts next.config.ts | sort -u`
(28 names, printed in the evidence), plus names read indirectly, which that pattern
misses: through an `env` parameter defaulting to `process.env`
(`COURSE_IMPORT_MODEL`, `VOICE_ANALYSIS_MODEL`).

- **production**: set on Vercel for the live site.
- **local-only**: scripts, tests, the CLI or the session hook; never on Vercel.
- **quiz-only**: read only by Colloquiz quiz code; dies in Stage 1.
- **system**: set by Node or Vercel, not by us.

`.env.example` is the one template (owner, 2026-11-14): MIG-001 added the names it
lacked and deleted `.env.local.example`, which was gitignored (`.gitignore:34`,
`.env*`) and so never reached a clone. Vercel column: environments from `vercel env ls`
(P = Production, Pv = Preview; none set for Development).

| Name | Class | Readers | In `.env.example` | Vercel |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | production | `lib/supabase/*`, `proxy.ts`, `next.config.ts`, scripts | yes | P, Pv |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | production | `lib/supabase/*`, `proxy.ts`, `VoiceRecorder.tsx` | yes | P, Pv |
| `SUPABASE_SERVICE_ROLE_KEY` | production | `lib/supabase/admin.ts`, scripts | yes | P, Pv |
| `NEXT_PUBLIC_SITE_URL` | production | `lib/site.ts` | yes | not set |
| `CRON_SECRET` | production | the four cron routes | yes | P |
| `TELEGRAM_BOT_TOKEN` | production | `lib/telegram/send.ts`, webhook route | yes | P |
| `TELEGRAM_WEBHOOK_SECRET` | production | webhook route | yes | P |
| `ANTHROPIC_API_KEY` | production | voice analysis, course import, account delete, cron sweep; also the quiz generator | yes | P |
| `ASSEMBLYAI_API_KEY` | production | `lib/voice/analysis/server.ts`, scripts | yes | P |
| `VOICE_ANALYSIS_MODE` | production | voice analysis route, `voiceTaskContext`, `learnerRead` | yes | P |
| `VOICE_ANALYSIS_MODEL` | production | `lib/voice/analysis/claude.ts` (indirect) | yes | P |
| `ANTHROPIC_MODEL_VOICE` | production (fallback for `VOICE_ANALYSIS_MODEL`) | `lib/voice/analysis/claude.ts`, `scripts/voice-bench-claude.ts` | yes | not set |
| `COURSE_IMPORT_MODE` | production | `lib/courseImport/access.ts`, import routes | yes | P |
| `COURSE_IMPORT_MODEL` | production | `lib/courseImport/claude.ts` (indirect) | yes | not set |
| `NEXT_PUBLIC_APP_VERSION` | production (optional; derived from `VERCEL_GIT_COMMIT_SHA` when unset) | `next.config.ts`, `lib/appVersion.ts` | no | not set |
| `VERCEL_GIT_COMMIT_SHA` | system (Vercel) | `next.config.ts` | — | system |
| `NODE_ENV` | system | `next.config.ts`, two admin pages | — | system |
| `ANTHROPIC_MODEL_GENERATOR` | quiz-only | `lib/generator/llm.ts`, `scripts/seed-questions-ai.ts` | yes | not set |
| `ANTHROPIC_MODEL_CRITIC` | quiz-only | same | yes | not set |
| `QUIZ_SESSION_TIMEOUT_MINUTES` | quiz-only | `lib/quizSession.ts` | yes | not set |
| `SUPABASE_ACCESS_TOKEN` | local-only (Supabase CLI and Management API) | not read by code | yes | not set |
| `BENCH_EMAIL`, `BENCH_PASSWORD`, `BENCH_PROD_URL` | local-only | `scripts/bench.ts` | yes | not set |
| `BUDGET_BASE_URL` | local-only | `scripts/budget.ts` | no | not set |
| `CONTEXT_GUARD_DISABLE`, `CONTEXT_GUARD_FORCE_FRACTION` | local-only | `scripts/session/context-guard.mjs` | no | not set |
| `LOCAL_API_URL`, `LOCAL_ANON_KEY`, `LOCAL_SERVICE_KEY` | local-only | `scripts/*-local-run.ts` | no | not set |
| `TZ` | local-only (tests) | three `lib/*.test.ts` | — | — |

Set on Vercel and read by nothing: `NEXT_PUBLIC_SENTRY_DSN` (P), `SENTRY_PROJECT`,
`SENTRY_ORG`, `SENTRY_AUTH_TOKEN` (P, Pv). Sentry was removed (0046/0047). Stale; not
carried. Deleting them is the owner's (the owner removed them from `.env.local`,
2026-11-14).

`NEXT_PUBLIC_SITE_URL` is not set on Vercel: production takes the default in
`lib/site.ts` (`https://colloquiz.app`). On NEW-DOMAIN it has to be set (MIG-014).


## How to re-read

- Supabase auth config: `GET https://api.supabase.com/v1/projects/{ref}/config/auth`
  with the access token, filtered in Node through an allow-list of non-secret key
  names (provider `enabled`/`client_id`/`email_optional`, `site_url`,
  `uri_allow_list`, `smtp_host|port|user|admin_email|sender_name|max_frequency`,
  `mailer_subjects_*`, `rate_limit_*`, password, session, MFA and hook
  `enabled`/`uri` keys) and a deny pattern (`secret|pass|token|api_key|access_key|_sid|test_otp`).
  The deny pattern also drops the non-secret `password_*` and
  `security_update_password_*` keys, so read those by name.
  Template bodies print as length and sha256 only. Never print the raw response:
  it carries the Google, Discord and SMTP secrets.
- Telegram client id: `curl -s -o /dev/null -D - "https://{ref}.supabase.co/auth/v1/authorize?provider=custom:telegram"`,
  reading the `Location` header (0098).
- Other Management API reads (`/v1/projects/{ref}`, `/postgrest`, `/config/storage`,
  `/config/realtime`, `/network-restrictions`, `/ssl-enforcement`,
  `/billing/addons`, `/custom-hostname`): each printed through a named-key filter.
- Database: `npx supabase@2.120.0 db query --linked "<select>" -o json` on
  `storage.buckets`, `pg_extension`, `cron.job`, `pg_publication_tables`,
  `vault.secrets` (count only), `version()`.
- DNS: `https://dns.google/resolve?name=<name>&type=<type>`.
- Vercel: `npx vercel@65.16.0` with `whoami`, `teams ls`, `project ls`, `domains ls`;
  `env ls` only into a file that is filtered to name and environments before anything
  prints, and printed only if every value cell reads `hidden`.
