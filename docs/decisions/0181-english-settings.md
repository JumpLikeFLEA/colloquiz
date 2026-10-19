# 0181 — Settings on the Alina Cher surface

Status: in progress (ad-hoc, owner request 2026-10-19). Step 1 (the shared theme) and step 2
(the page) are built; the account-menu link and the sign-in notice follow. No migration.

## Context

Owner report: account deletion, the light/dark theme and the other account options were
out of reach for an Alina Cher learner, because they live only on the Colloquiz Settings page
(`/app/settings`), inside the Colloquiz shell. The English account menu never links into
`/app`: the footer is the only path there (0062, restated in 0086). The privacy policy tells
every user to use "Settings › Data and privacy" for export and erasure
(`docs/release/legal/privacy-policy.md` §8), which an English learner could not find.
The English surface had no theme choice at all: its root layout set `.dark` from
`prefers-color-scheme` only (0046).

## Options

- **A. A new English-surface page, `/my/settings`,** under the English layout and the
  saved EN/RU choice, carrying only what applies to an English learner.
- **B. Link the account menu to `/app/settings`.** One line, but it lands the learner in the
  Colloquiz shell (sidebar, duels, quiz nav), English only, with Colloquiz-specific sections,
  and reverses the 0062 rule.

## Decisions

All settled with the owner in the session that built this (2026-10-19).

1. **Option A, `/my/settings`.** The 0062 "footer is the only path to /app" rule stands.
2. **Three sections: Appearance, Sign-in methods, Data and privacy.** No Account profile
   section: name, public name, city and profile picture are shown nowhere on the English
   surface or in Studio (a grep for `display_name|full_name|avatar_url` under `app/(english)`
   and `app/(studio)` found nothing, 2026-10-19). No Notifications section: those switches
   gate Colloquiz bell events only (`lib/notificationPrefs.ts`). Both stay at `/app/settings`.
3. **One theme preference across Colloquiz, Studio and Alina Cher.** The English surface
   reads and writes next-themes' own localStorage key, `theme` (`THEME_STORAGE_KEY`,
   `lib/theme.ts`; ThemeProvider sets no `storageKey`), and `profiles.theme_preference`
   (025, which already has its column GRANT). Still no next-themes on the English surface:
   the layout's inline script does the work, so `/` and the lessons ship no theme JS.
   Consequence for existing users: someone who chose Light or Dark in Colloquiz now sees
   that choice on Alina Cher too, instead of the OS setting.
4. **A choice made on another device is adopted on every signed-in English page, before
   first paint.** The root layout reads `profiles.theme_preference` server-side
   (`getThemePreference`, `lib/themePreferenceServer.ts`) and embeds it in the inline script
   (`englishThemeScript`). When it differs from this device's stored value, the script stores
   it and applies it. This differs from Colloquiz's ThemeSync, which corrects the theme a frame
   after hydration: here the layout already knows the value, so there is no flash.
   `getThemePreference` is its own cached read, not part of `getSignedInAccount`. If the layout
   called that, its `cache()` could keep the unread count from before `/my/messages/[teacherId]`
   marks a thread read (`lib/signedInAccount.ts`). An anonymous visitor pays no network call.
   Like ThemeSync, a choice whose account write failed is overwritten by the saved value on
   the next load; the settings page says so when the write fails.
5. **English-surface versions of the three sections**, with `{ ru, en }` copy following
   the saved choice (the `/my` rule, 0120). They reuse the endpoints and the pure lib. The
   Colloquiz Settings page is unchanged. The delete copy follows privacy policy §9, not the
   Colloquiz list, which is about quizzes and leaderboards.
6. **After deleting, the learner lands on `/login?next=/&notice=account_deleted`**: the
   English sign-in panel (0135), with a notice that drops "Thanks for using Colloquiz".
7. **The account card gets "Settings" / "Настройки", just above Sign out**, for every
   signed-in user, with lucide's `Settings` icon and its neighbours' classes. It is a plain
   `<a>`, so zero client JS.
8. **No link from `/my/settings` to Colloquiz settings** for the profile fields. A
   rectification request can still go to privacy@colloquiz.app (§8).
9. **Ad-hoc, no board card.**

Decided by following existing rules:

- In an Instagram or Telegram in-app browser, Connect is replaced by a note to open the
  page in Safari or Chrome. This is the registration offer's rule (`isOAuthProviderAvailable`,
  `lib/inAppBrowser.ts`, 0098). Disconnect stays.
- The English layout has no Toaster, so results and errors are shown inline.
- Visual frame: `/my/messages`' gradient band until PROG-007 restyles `/my`. Existing
  classes and tokens only.
- The 409 `owns_groups` refusal still links to `/app/groups/<id>`. It is the only way to
  clear the block, and it appears only in that error state.

## What would make us revisit it

- PROG-007 restyles `/my` (the page follows it).
- The English surface starts showing a profile field (name, picture): Account comes back.
- A phone pass adds a provider to `WORKS_IN_IN_APP_BROWSER`.
- The privacy policy's Settings paths change.
- A per-surface theme is wanted: that needs its own key and, for cross-device, a column.

## Measured

Step 1, the theme script. Local stack, `next dev` on :3100, Edge via Playwright at 1280×800.
`darkAtFirstMain` is whether `<html>` had `.dark` when the first `<main>` was parsed
(MutationObserver from an init script):

```
anon, OS light, nothing stored: darkAtFirstMain=false darkNow=false localStorage.theme=null browserProfileRequests=0
anon, OS dark, nothing stored: darkAtFirstMain=true darkNow=true localStorage.theme=null browserProfileRequests=0
anon, OS light, stored dark: darkAtFirstMain=true darkNow=true localStorage.theme=dark browserProfileRequests=0
anon, OS dark, stored light: darkAtFirstMain=false darkNow=false localStorage.theme=light browserProfileRequests=0
signed in (pref NULL), OS light, stored light: darkAtFirstMain=false darkNow=false localStorage.theme=light browserProfileRequests=0
signed in (pref NULL), OS light, stored light, lesson page: darkAtFirstMain=false darkNow=false localStorage.theme=light browserProfileRequests=0
signed in (pref dark), OS light, stored light: darkAtFirstMain=true darkNow=true localStorage.theme=dark browserProfileRequests=0
signed in (pref dark), OS light, stored light, lesson page: darkAtFirstMain=true darkNow=true localStorage.theme=dark browserProfileRequests=0
```

The script's "lesson page" label is wrong: those runs loaded `/courses/future-imperfect`, the
course page. The two "pref dark" lines set `prog002-learner`'s `theme_preference` to `dark` on the
local stack, and it was put back to NULL afterwards. The "pref NULL" lines are the control.
`lib/theme.test.ts` runs the script against a fake window, including storage that throws
and a hostile value.

Step 2, `/my/settings`. Same setup, at 360×800, the seeded learner unless noted. The
Connect counts are exact-name matches:

```
A en 360 default: 360/360 h1= Settings sections= 3 connectButtons= 3
A after Dark: html.dark= true ls= dark db= dark line= Your device is currently light.
A reload: html.dark= true checked= dark
A /app (Colloquiz): path= /app html.dark= true
A after System: html.dark= false ls= system db= system
B ru 360: 360/360 h1= Настройки dataTitle= Данные и конфиденциальность
C instagram UA 360: 360/360 connectButtons= 0 note= 1
L connect google: 360/360 alert= "That didn't work: Manual linking is disabled" chunksFetchedOnClick= 3
```

`npm run viewport360` printed `/my/settings | 200 | scrollWidth/innerWidth 360/360` for EN
(`--expect="Data and privacy"`) and RU (`--expect="Данные и конфиденциальность"`).

Unlink and delete used throwaway local accounts (Admin API), deleted afterwards. The
unlink account got a second, `google` identity inserted into the local `auth.identities`.
With the local config's `enable_manual_linking = false`, GoTrue refused the unlink, and the
page showed it inline:

```
D unlink confirm open: 360/360 dialog x/w= 21 318 title= Disconnect Google?
D outcome: status= "" alert= "That didn't work: Manual linking is disabled"
```

With `enable_manual_linking = true` set temporarily (stack restarted, then reverted and
restarted again):

```
D two identities 360: 360/360 googleDisconnectEnabled= true emailDisconnectEnabled= true
D unlink confirm open: 360/360 dialog x/w= 21 318 title= Disconnect Google?
D outcome: status= "Google disconnected." alert= null
D after unlink: 360/360 googleRow= Google Not connected Connect emailDisconnectEnabled= false
E delete dialog open: 360/360 dialog x/w/h= 23 315 641 deleteEnabledBeforeTyping= false
E after delete: url= /login?next=/&notice=account_deleted notice= "Your account has been closed and your personal details erased. Thanks for using Colloquiz." alinaPanel= true 360: 360/360
E ban: 2126-09-25T16:18:01.6328Z profile: {"display_name":"Deleted user","deleted_at":"2026-10-19T16:18:01.54408+00:00"}
```

"emailDisconnectEnabled= false" after the unlink is the last-method rule taking over. The
notice still names Colloquiz there; step 4 changes it. The learner's `theme_preference` was
put back to NULL after the runs.

**Budget.** `npm run budget` on the local stack, base commit `1f9ce6a` and this work, every
existing route identical:

```
/ | 191.6 KB | 202 KB
/ (phone) | 184.7 KB | 194 KB
/courses/future-imperfect/true-or-false | 256.3 KB | 260 KB
/courses/future-imperfect | 175.3 KB | 182 KB
/my | 174.4 KB | 180 KB
/my/messages | 175.9 KB | 184 KB
```

(Same figures before and after; the other five routes too.) `/my/settings` first measured
262.3 KB with a FORBIDDEN-PACKAGE line for `@supabase/ssr`: the sections imported the browser
Supabase client statically. They now import it at the first action, the LessonPlayer /
VoiceRecorder / RegistrationOffer precedent, and the page measures `199.4 KB` with no
forbidden signature; its budget is 208 KB (+~4.5%, the PLAY-012 precedent). The "L" line above
shows the client chunks arriving on the click. The A and L runs are after that change; the
D and E runs were before it (the same calls, imported statically).

Not measured: a real Telegram, Google or Discord link round trip (no provider is configured
on the local stack), a phone or an in-app browser beyond the user-agent switch, and a
deletion blocked by an owned Colloquiz group (the 409 rendering), and an unlink after the
lazy-import change.
