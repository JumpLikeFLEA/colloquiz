---
name: verify
description: How to build, run, and drive this app to verify changes end-to-end (Next.js + cloud Supabase, Windows)
---

# Verifying changes in colloquiz

## Launch
- `npm run dev` (background) → http://localhost:3000. Ready when `/login` returns 200 (takes ~10-20s).
- Cloud Supabase is configured in `.env.local` (project kumrlovftctxcbbbmnfy). There is no local Supabase CLI stack — auth calls hit the real cloud project.

## Drive the UI (no Playwright in repo)
- Install Playwright in the session scratchpad (`npm i playwright`) and launch with `channel: 'msedge', headless: true` — uses system Edge, no browser download.
- Auth form field ids: `#name`, `#email`, `#city`, `#password`, `#confirmPassword`; submit is `button[type=submit]`.
- Routes: `/login`, `/signup` (unauthenticated); everything else redirects to `/login` via `proxy.ts` (this Next.js fork's middleware).

## Gotchas
- Signing up creates a REAL user in the cloud project and sends a REAL email. Use a plus-alias of a controlled inbox (e.g. `user+test@gmail.com`) and tell the user so they can delete the test user in the Supabase dashboard (Auth → Users).
- Supabase resend rate limit: re-submitting signup for the same email within ~60s shows "For security purposes, you can only request this after N seconds" in the form's error box. Wait 65s between signup attempts.
- Built-in email service also has a PROJECT-WIDE limit (~2-4 emails/hour). Once hit, any signup shows "email rate limit exceeded" — no more signup-flow email tests that hour. Budget test signups accordingly.
- Email confirmation is ON in the cloud project: `signUp` returns `session: null` → AuthScreen shows the "Check your email" view.
- `/auth/confirm?token_hash=...&type=email` is the email-confirmation handler; invalid/missing params redirect to `/login?error=confirm_expired`. Testable with curl (`-w "%{http_code} -> %{redirect_url}"`).
- Full email-link click-through can't be automated (needs inbox access + the dashboard email template pointing at `/auth/confirm`).
