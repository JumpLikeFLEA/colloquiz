# Launch checklist — the steps that are not code

Everything here is done in a dashboard, a DNS panel or a password manager. None of it can
be done from the repository, and all of it must be done before 1.0 ships. Ordered so that
blockers come first.

Companion to [`definition-of-ready-1.0.md`](./definition-of-ready-1.0.md).

---

## 1. Blockers — the launch is broken without these

### ☐ Verify the Resend sending domain

**Symptom if skipped: nobody except the operator can create an account.** Resend was
connected as Supabase's custom SMTP provider on 2026-07-18 and was left in **test mode**,
which delivers only to `chernov.gleb23@gmail.com`. Every other sign-up confirmation and
password-reset mail is silently dropped.

1. Resend → Domains → add the domain, publish the SPF, DKIM and DMARC records at the DNS
   provider, wait for verification.
2. Set a real from-address (`no-reply@…`) in Supabase → Project Settings → Auth → SMTP.
3. Test: sign up with an address on a different provider entirely (not a `+tag` alias of
   the operator's own inbox — an alias can pass while the domain is still restricted) and
   confirm the mail arrives and the link works.

### ☐ Supabase Auth → URL Configuration

The redirect allow-list may still be localhost-only.

- **Site URL:** `https://colloquiz.app`
- **Redirect URLs:** add `https://colloquiz.app/**` (keep `http://localhost:3000/**` for
  development)
- Confirm the Reset Password template still points at
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
  — this is what makes cross-device recovery work.

### ☐ Rotate `BENCH_PASSWORD`

A live production Supabase account currently has the password `bench123`. Rotate it to a
generated value, update `.env.local`, and scrub `.env.local.example` back to placeholders
(it holds real keys including a service-role key — untracked, but it should not read like
a working config).

---

## 2. Legal facts to decide

These block the documents, not the code. Nothing else in section A of the DoR can be
finished until they are answered.

- ☐ **Controller name** — the legal name that appears in both documents.
- ☐ **Country** — governing law, and the courts clause in Terms §11.
- ☐ **Contact email** — a real, monitored address. It carries the erasure and
  rights-request obligation (one-month response), and per ADR 0002 it is also the fallback
  for the one thing self-serve deletion cannot do. A forwarding alias is fine; an
  unread inbox is not.
- ☐ **Supabase project region** — read it from the dashboard; do not guess. It goes into
  Privacy Policy §6 and the subprocessor table.
- ☐ **Publication date** — the "Last updated" stamp on all three legal documents.

---

## 3. Accounts and services to create

- ☐ **Vercel Analytics + Speed Insights** — enable in the Vercel project. Confirm on the
  plan in use; both are cookieless, which is what keeps the no-cookie-banner position
  valid.
- ☐ Add it to [`legal/subprocessors.md`](./legal/subprocessors.md) **before** it goes
  live, and move it out of the "not yet added" table.

---

## 4. Infrastructure to confirm

- ☐ **Supabase backups / PITR** — check what the current plan actually retains. The free
  tier's retention is short.
- ☐ **`/authored` backup — decided: stays gitignored, backed up separately.** The corpus
  (27 files, ~142 KB zipped) is the only way to re-import or correct a batch, and it
  exists nowhere else but this machine and the production DB.

  Snapshot taken 2026-08-28 → `C:\Users\PC\Backups\colloquiz\authored-<date>.zip`.
  Regenerate with:

  ```powershell
  $d="C:\Users\PC\Backups\colloquiz"; New-Item -ItemType Directory -Force $d | Out-Null
  Compress-Archive -Path "C:\Users\PC\Git\colloquiz\authored\*" `
    -DestinationPath (Join-Path $d "authored-$(Get-Date -Format yyyy-MM-dd).zip") -Force
  ```

  **☐ Still to do: move a copy off this machine.** A zip in `C:\Users\PC\Backups` shares
  a disk, an OS and a burglar with the original — it is a convenience copy, not a backup.
  Put it in the cloud drive or a private repo, and re-run the command after each
  authoring session (Sessions B and F..N both add files).
- ☐ **Domain** — confirm `colloquiz.app` registration expiry and auto-renew, and that DNS
  is where you think it is (the Resend records land here too).
- ☐ **Supabase project region** — see §2; also confirm it matches Vercel's `dub1` for
  latency, not only for the policy.

---

## 5. Pre-launch dry run

- ☐ Create a **fresh throwaway account** on a non-operator email domain and walk the whole
  product per the `verify` skill: signup → email confirm → quick play at each difficulty →
  results → progress / history → achievements → settings (avatar, notifications, export,
  **delete**) → group create and join → duel → password reset.
- ☐ Confirm `https://colloquiz.app/terms` and `/privacy` return **200** while signed out
  *and* while signed in.
- ☐ Confirm `https://colloquiz.app/robots.txt` returns a `noindex` policy rather than a
  redirect to `/login`.
- ☐ Trigger a deliberate error and confirm the error boundary renders.
- ☐ `npm run bench -- --target=prod` — record the 1.0 baseline in `.perf/`.

## 6. Go / no-go

Ship when: all §1 blockers cleared · both legal documents published and reachable ·
account deletion works end-to-end on a throwaway account · no subject under 30 questions
at any difficulty · `npm run check`, `npm test` and `next build` clean · error boundaries
live.

Do not ship on: unverified sending domain · a placeholder left in a legal document · a
deletion path that errors · any subject still unplayable at a difficulty.
