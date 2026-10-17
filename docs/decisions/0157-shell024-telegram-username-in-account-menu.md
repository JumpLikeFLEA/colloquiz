# 0157 — SHELL-024: the account menu names a Telegram user

Date 2026-10-17. Card SHELL-024 (#207). Depends on ANON-012 (closed).

## Context

An account with no email (Telegram sign-in) got the person icon and "You are
signed in" from the English account chip (docs/decisions/0086). Decision 0098
printed `preferred_username` in `user_metadata` for a Telegram account.

## Decision

1. **Source: the JWT's `user_metadata.preferred_username`, no network call.**
   `authUserFrom` already reads the claims; it now also returns `username`
   (`usernameFromClaims`, lib/auth.ts). Measured source: a local access token
   minted for a user created with `user_metadata.preferred_username` carries
   `user_metadata: { email_verified, name, preferred_username }` (probe run in
   the SHELL-024 session, printed in the card's evidence comment). That user
   was an email-provider user with the metadata set by the admin API, not a
   real Telegram sign-in: the claim's presence for a real Telegram token rests
   on 0098's printed `user_metadata`, not on a token minted here.
2. **Only when the email is empty.** An email account's `username` is null, so
   it is unchanged whatever its metadata holds.
3. **Display only.** `user_metadata` is editable by the user, so the value is a
   label and nothing is authorised on it. It is trimmed, stripped of a leading
   "@" and capped at 64 characters; React escapes it.
4. **Server Component, zero client JS.** `username` is a prop beside `email`.
   `getSignedInAccount` returns it, so all eleven call sites pass it through.

## Revisit if

- A real Telegram token shows `preferred_username` missing from the claims
  (then read `auth.identities` through a query, which costs a round trip).
- Telegram usernames become optional for sign-in (some accounts have none):
  such an account still gets the icon and "You are signed in".
