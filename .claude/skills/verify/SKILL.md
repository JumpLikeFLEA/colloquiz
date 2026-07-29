---
name: verify
description: How to build, run, and drive this app to verify changes end-to-end (Next.js + cloud Supabase, Windows)
---

# Verifying changes in colloquiz

## Static check first
- `npm run check` (= `tsc --noEmit && eslint .`). It exits 0 on a clean tree, so any output is something you introduced.
- Do this before starting the dev server: a lint error costs seconds to fix, a failed E2E run costs a real Supabase test user to clean up afterwards.
- `next lint` does not exist in Next.js 16 — use `npm run lint` / `npm run lint:fix`.

## Launch
- `npm run dev` (background) → http://localhost:3000. Ready when `/login` returns 200 (takes ~10-20s).
- Cloud Supabase is configured in `.env.local` (project kumrlovftctxcbbbmnfy). There is no local Supabase CLI stack — auth calls hit the real cloud project.

## Drive the UI (no Playwright in repo)
- Install Playwright in the session scratchpad (`npm i playwright`) and launch with `channel: 'msedge', headless: true` — uses system Edge, no browser download.
- Auth form field ids: `#name`, `#email`, `#city`, `#password`, `#confirmPassword`; submit is `button[type=submit]`.
- Routes: `/login`, `/signup` (unauthenticated); everything else redirects to `/login` via `proxy.ts` (this Next.js fork's middleware).

## Test users: prefer the Admin API over the signup form
Unless the signup FLOW is what you are testing, do not drive `/signup`. Create the
user directly with the service-role key (`SUPABASE_SERVICE_ROLE_KEY` is in
`.env.local`), which sends no email and needs no confirmation round trip:

```js
const admin = createClient(URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
await admin.auth.admin.createUser({ email, password, email_confirm: true });
// ...drive the app, then:
await admin.auth.admin.deleteUser(id);
```

`email_confirm: true` marks the address confirmed on creation, so the account can
sign in at `/login` immediately. Set `profiles.role = 'admin'` with the same client
to test admin-gated routes. Delete the user (and any rows it created) when done —
this is a real shared cloud project.

## Gotchas
- Signing up through the FORM creates a REAL user and sends a REAL email. Use a plus-alias of a controlled inbox (e.g. `user+test@gmail.com`) and tell the user so they can delete the test user in the Supabase dashboard (Auth → Users).
- Supabase resend rate limit: re-submitting signup for the same email within ~60s shows "For security purposes, you can only request this after N seconds" in the form's error box. Wait 65s between signup attempts.
- There is NO restrictive project-wide email cap: the project sends through custom SMTP (Resend), not Supabase's built-in service with its ~2-4/hour limit. Confirmed 2026-07-29. Volume is still not free, so prefer the Admin API above.
- Email confirmation is ON in the cloud project: `signUp` returns `session: null` → AuthScreen shows the "Check your email" view.
- `/auth/confirm?token_hash=...&type=email` is the email-confirmation handler; invalid/missing params redirect to `/login?error=confirm_expired`. Testable with curl (`-w "%{http_code} -> %{redirect_url}"`).
- Full email-link click-through can't be automated (needs inbox access + the dashboard email template pointing at `/auth/confirm`).
