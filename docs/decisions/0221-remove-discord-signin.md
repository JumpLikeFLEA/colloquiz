# 0221 — ANON-019: remove Discord sign-in

## Context

The owner disabled the Discord provider in the hosted Supabase project on 2026-11-05, so every
Discord button ended in a provider error. The Discord feedback webhook (`lib/feedbackNotify.ts`)
is a different thing and stays.

## Probe (hosted, read-only, `db query --linked`, 2026-11-05)

- `auth.identities` with `provider = 'discord'`: 0. Users with only a Discord identity: 0.
- Positive control, same table grouped by provider: google 12, email 9, custom:telegram 2. The
  zero is a real zero, not an empty table.

So nobody is locked out and no follow-up card is needed.

## Decision

1. Remove Discord from every screen (login, signup, registration offer, both sign-in-method
   lists), from `OAuthProvider`, `DiscordIcon` and `oauthDiscord`, and from every provider list in
   copy (EN and RU). Google takes the full-width row under Telegram.
2. Legal: privacy 1.10 and subprocessors 1.7 (2026-11-05). Removing a recipient is not material
   (0095), so no notice. OPS-029's unpublished drafts (0201) move to privacy 1.11 and
   subprocessors 1.8.
3. Historical docs keep their mentions. `supabase/config.toml` needed no change.

## Revisit when

Discord sign-in is wanted again: re-add the provider in Supabase first, then the code, then the
legal rows.
