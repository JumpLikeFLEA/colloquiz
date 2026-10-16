# 0151 — TCH-004: messages between a linked student and their teacher

Status: built; migration 079 applied by the owner and its verify script
(`supabase/verify/079_teacher_messages.sql`) run by the owner in the SQL editor:
success (no assertion raised; the editor shows no notices). Also replayed from
001 on a local Supabase stack, where the script passes. Decided unattended under
`--no-approval`; each call below is one the owner can overturn.

The first hosted run failed on "t thread is no longer unanswered": the SQL editor
runs the script in one transaction, so both messages had the same `NOW()` and
"last message" fell to a random uuid tie-break (the unfixed script passed 4 of 12
local runs). The script now stamps each seeded message with `clock_timestamp()`
through a trigger that rolls back with it; the migration was not at fault, and
real messages are separate transactions.

## Context

docs/decisions/0141 Decisions 8, 9 and 17: one conversation per linked pair,
students only may start one (the teacher may write first), no realtime, badges
in the app and Telegram later (TCH-012). 0144 Q4: deleting an account removes
the whole conversation, both sides. Privacy 1.5 §5, §4, §8 and §9 already say
all of it (two-party conversation, readable and closed after a link ends,
exported, deleted outright), so no legal text changes. One point it does not
list: a per-message read marker (Decision 5).

## Decisions

1. **Two tables, no grants, SECURITY DEFINER functions only** (the 076/077
   shape). `teacher_conversations(teacher_id, student_id)` with a unique pair;
   `teacher_messages(conversation_id, author_id, body JSONB, created_at,
   read_at)`. Every read and write is a function scoped by `auth.uid()` being
   a party. `has_table_privilege` is false for `authenticated` on both
   (verify script).
2. **One conversation per pair, ever.** Relinking after a link ended reopens
   the same conversation. A conversation exists only once it has a message
   (the first message creates it), so "a conversation with no messages" is not
   a state. "Closed" is not stored: it is `NOT (_teacher_linked AND
   _is_teacher)`, evaluated at read time, so it cannot disagree with the link
   (0148 Decision 6).
3. **Pages are keyed by the other person's profile id**, not a conversation
   id: `/my/messages/[teacherId]`, `/studio/messages/[studentId]`. A teacher can
   write first only if the URL works before a conversation row exists.
   `message_threads(role)` returns conversations plus linked peers with no
   conversation (NULL `conversation_id`), so the same list offers "Start a
   conversation". An id that is neither linked nor in a conversation with the
   caller is a 404. This exposes the peer's profile uuid to a linked party; it
   is the same uuid Studio already shows its linked students under.
4. **Body is the feedback format** (0096): `FeedbackContent` JSON, validated by
   060's `_feedback_content_valid` plus a 2,000-character cap
   (`_message_body_valid`). Rendered by `FeedbackContentView`. The cap is
   checked in three places that must agree: SQL (authoritative), the route
   (`parseMessageBody`) and the composer's counter (`MESSAGE_MAX_CHARS`); the
   verify script covers the 2,000 / 2,001 boundary and `lib/messages` tests the
   TS side.
5. **A sender never sees when the reader read their message.** `read_at` is
   set when the other party reads, and `conversation_messages` and the export
   return it only on the caller's *received* messages (NULL on their own).
   The UI shows only "New" to the reader. Why: privacy 1.5 does not list a
   read marker, and a read receipt is something a teacher or student would
   not expect to be disclosed. The column itself is in the card's acceptance.
   **Flagged for the owner:** the policy is silent on read markers as such;
   they are stored but shown to no one but their own subject.
6. **Rate limit: 30 messages per author per rolling hour**, a BEFORE INSERT
   trigger on `teacher_messages` (the 026/038 pattern), PT429 mapped to a 429
   by the route. 30 is a guess at "a teacher answering a full inbox in an hour
   fits, a student flooding does not"; nothing measured it. Revisit on a real
   complaint either way.
7. **Unanswered is decided in SQL** (`message_threads.unanswered`): last
   message is the student's AND the link is live. A closed thread is not
   unanswered (the teacher cannot answer it). The Studio nav badge and the
   inbox's "Unanswered questions" read the same cached `getTeacherThreads()`
   call (the 0118 precedent), so they cannot disagree.
8. **The unread dot is fail-soft; the pages are not.** `getSignedInAccount`
   gains `unreadMessages` (one more parallel RPC for a signed-in user only; an
   anonymous visitor pays nothing). A failure returns 0, because it runs in the
   chrome of every English page and 079 may not be applied when this deploys.
   `/my` leaves its "Messages" row out on failure for the same reason. The
   Studio inbox shows "Couldn't load your students' messages" rather than an
   empty list. `/my/messages` and `/studio/messages` read strictly and throw.
9. **Marking read happens after the thread is read, and before the chip.** The
   thread page reads the messages (so "New" can be shown), marks them read, and
   only then first calls `getSignedInAccount()`, whose `cache()` would otherwise
   keep the pre-read count for the rest of the request. Measured: after
   opening the thread, `/my` has no dot.
10. **Export: the caller as student only** (`my_conversations_export`, format
    version 11, key `teacher_conversations`), the `my_teacher_links` precedent:
    the teacher's side describes other people.
11. **Account deletion:** `delete_my_account` re-emitted from 077 (the print
    rule's latest body; diffed against 077, the only difference is one added
    `DELETE FROM teacher_conversations WHERE student_id = v_me OR teacher_id =
    v_me`). Messages cascade, and so will anything TCH-006 hangs off a message
    row by foreign key. TCH-006 must keep that: its snapshots must be columns of
    `teacher_messages` or child rows with `ON DELETE CASCADE`.
12. **Composer is one client component for both surfaces**
    (`app/components/messages/MessageComposer.tsx`), all strings passed in as
    props so neither language ships in the bundle (0079 "Budget"); no preview or
    draft states, no toast (the English surface has no Toaster).
13. **`/my/*` is now gated by the proxy** (`/my` was exact-path). The page also
    redirects a lapsed session, as `/my` does.

## Budget

`npm run budget` against the local stack, before (tree stashed) and after:

| route | before | after |
|---|---|---|
| `/` | 178.2 KB | 178.2 KB |
| `/my` | 171.5 KB | 171.5 KB |
| `/my/messages` | n/a | 175.9 KB (budget 184, measured + ~4.5%) |

Against the hosted project `/my` cannot be measured (the seeded learner does
not exist there; FAIL before and after) and `/` was 179.1 KB before and after.
The thread page `/my/messages/[teacherId]` has no stable URL (a per-seed id)
and is not in the guard; it adds the composer and `MessageTime`.

## What would make us revisit

- The legal text is revised to list read markers, or the owner prefers none:
  drop `read_at` entirely (the unread count then needs another definition).
- Teachers want a conversation per course or per question (0141 Decision 8,
  option B).
- Students ask for an attachment: that is TCH-006.
- 30 per hour is wrong in either direction.
- Realtime is wanted: today a page load shows new messages.
