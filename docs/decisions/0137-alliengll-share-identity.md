# 0137 — The English surface's share previews say Alliengll

## Context
An invite link pasted into Telegram previewed as "Your invite · Colloquiz" over
the Colloquiz quiz card ("Test your knowledge with interactive quizzes"). The
owner reported this as misleading on 2026-10-14. Two fallbacks caused it:

- `/invite/[token]` had no `opengraph-image`, so it used
  `app/opengraph-image.tsx`, the Colloquiz card. `/` (the Instagram bio link),
  `/my` and `/runs/*` fell back the same way. Measured with curl on the
  pre-change tree (`git stash`): `/` served `og:image` `/opengraph-image`.
- `app/(english)/layout.tsx`'s title template was `%s · ${alliengllCopy.siteName}`,
  and `siteName` was `"Colloquiz"`. So course and lesson shares (0065) also
  ended in "· Colloquiz".

`docs/handoff.md` listed the English platform's name as deliberately deferred.
"Alliengll" appeared only as page-level display text (0078, 0079 D9).

## Options (asked in session, 2026-10-14)
1. **English surface**: every English route's tab title, og:site_name and share
   card say Alliengll. Colloquiz (`/app`) is unchanged.
2. Invite links only.
3. Share cards only; tab titles keep "· Colloquiz".

## Decision
Option 1 (owner).

1. `alliengllCopy.siteName` is `"Alliengll"`. The title template becomes
   `%s · Alliengll`, and the default tab title and the share cards' `alt` follow
   it. `lib/site.ts`'s `SITE_NAME` (Colloquiz) is untouched.
2. The English layout's metadata sets `openGraph: { siteName, type: "website" }`.
   Next still fills `og:title`/`og:description` from each page's own
   title/description (curl: `/courses/future-imperfect` → `og:title` "Future
   Imperfect · Alliengll", with the course's own description).
3. `app/(english)/opengraph-image.tsx` is the surface's default card: the hero
   title and subtitle on the brand gradient. The route-group file wins over
   `app/opengraph-image.tsx` for `/` (curl: `og:image`
   `/opengraph-image-t1pomn?…`, a hashed route-group path).
4. `OgImageCard` gains the "Alliengll" wordmark at the top left of every card,
   and an optional `eyebrow` pill before the level. Colours are inherited, so no
   new hex literals.
5. Invite links get their own card and metadata:
   - **Card:** the course's cover, a "You're invited" pill, the level, the title,
     and the subtitle (else the description). An unknown token falls back to the
     surface card.
   - **Metadata:** title "Invite to <course>", description "You're invited to
     join <course>." In English, like the claim page (0107).
   - **Same for every invite state:** Telegram caches a preview per URL, so a
     state-specific card would outlive its state. The preview is a read;
     claiming stays the POST button (0107).
   - **One RPC per request:** `getInvitePreview` is wrapped in React `cache()`,
     so the page and its metadata share one call.

Not changed: the `/login` tab title (0135), auth emails, and invite URL shape.
The 128-bit token is the secret, and a shorter or slug-style link would make
invites guessable or need a migration for no visible gain. The partner can
already hide the raw URL by sending it as Telegram hyperlinked text.

## Revisit if
The English surface gets a different name, or a sub-brand under Colloquiz is
chosen after all. Also revisit if a crawler is found that spends or reveals
invite state, which would contradict 0107's read-only preview.

## Verification
- **Static gate:** `npm run check` passes (hex guard: 14 files within baseline);
  `npm test` (1241 pass).
- **Title, og:site_name, og:image (dev server, curl):**
  - `/` → "Alliengll", the surface card.
  - `/courses/future-imperfect` → "Future Imperfect · Alliengll", the course card.
  - `/invite/<unknown>` → "Your invite · Alliengll", the invite route's card.
  - `/login` → unchanged: Colloquiz, no og:image before or after.
- **PNGs, looked at:** the surface card and the course card, both with the
  wordmark and Cyrillic rendered. The eyebrow pill was checked with a temporary
  swap on the surface card, then reverted.
- **Not exercised: the pending-invite card with a real course.** Tokens are
  stored hashed (059), and creating an invite writes to the hosted database.
  Check after deploy by pasting a fresh invite into Telegram.
- **Previews already sent** keep their cached card until refreshed through
  @WebpageBot.
