# 0231 — VOICE-018: the offer next to the interim feedback, and the sign-in invitation

Status: written 2026-11-20; VOICE-018 (#321). Follows 0229 (Decisions 2 and 5).

## Context

0229 settled that the page, not the model, makes the offer (Decision 5) and that an anonymous
visitor is asked to sign in in place of Send on the lesson-1 start task, without a wall in front of
the lesson (Decision 2). This card builds both.

## Decisions

1. **The offer is decided by `lesson_state()` (055), in the status route.** `statusDeps.readOffer`
   calls it, under the caller's session, for each lesson the interim analysis links to. If any
   returns `needs_entitlement`, and the course has an https `how_to_join_url`, the status body
   carries `offer: { howToJoinUrl }`. The view draws what it is given; it computes nothing. Only the
   take's owner is asked (a teacher reading the same row is not a prospect), and a failed read costs
   the offer, never the analysis. Evidence it reads the right word: on the local stack, as an
   authenticated user with no entitlement, `lesson_state` for an entitled lesson printed
   `needs_entitlement`; after a `course_entitlements` grant, in the same transaction, `open`
   (rolled back; 0 rows left).
2. **No price.** The acceptance line allows one "only if the course data holds one". No `courses`
   column holds a price (`grep -i price supabase/migrations/*.sql` finds none for courses), so none
   is shown.
3. **No join link, no offer.** A course with no `how_to_join_url` gets no card: a card with no
   action would only say "this is paid". The target is the same link the paid-lesson card uses
   (0136), opened in a new tab.
4. **Placement.** The card sits under the "In this course" list, so it is only ever drawn beside
   course links; an interim analysis with no links shows no offer.
5. **EN/RU.** Both strings follow the saved EN/RU choice (`colloquiz_landing_lang`, read in
   `getVoiceTasksContext` and carried as `context.lang`), although the lesson's other chrome is
   fixed English (0080 Decision 5): these are the page speaking to a prospect, which is what the
   acceptance line asks for in both languages. Copy is in `lib/alliengll/voiceOfferCopy.ts`, in the
   recorder's lazy chunk only. Wording is pending owner review.
6. **Sign-in invitation.** `getVoiceTasksContext` returns `signInNext` (the lesson's path) for an
   anonymous visitor on an open lesson while the analysis is on. A `before` task then shows, under
   the take list, a note, and a "Sign in to send" link in the take row where Send would be. The
   link is `/login?next=<lesson path>#voice-<block id>`; the voice card carries that id
   (`voiceAnchorId`), so the learner returns to the same task. Not shown when the analysis is off
   (nobody can send then), on a task that is not `before`, or to a signed-in learner.
7. **Recordings are not carried across the sign-in.** Practice takes live only in memory (0141
   Decision 11), so the note says to record again after signing in. Persisting them would redo that
   decision.

## Revisit when

- A course gets a price column: show it in the card, from data.
- Practice takes are persisted (0141 Decision 11): the sign-in note's last sentence goes.
