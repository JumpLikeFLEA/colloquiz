# 0154 — TCH-007: author seats and /studio/authors

Status: built; migration 082 written and applied to the local stack twice,
where `supabase/verify/082_author_seats.sql` prints `TCH-007 PASS: 082 full
protocol`. **Not applied to the hosted project**, as the card asks ("Written,
not applied"). A read-only probe on 2026-10-16 found 080 and 081 present on
hosted, `author_seats` absent, and 3 distinct `course_editors` holders (the
backfill's expected count there, minus any deleted accounts). Decided
unattended under `--no-approval`; each call below is one the owner can
overturn.

## Context

docs/decisions/0141 Decisions 1, 2 and 18: manual seats, paid outside the app,
managed by an admin at `/studio/authors`; "today's editors become seats with no
expiry; the partner holds the house seat"; co-editor grants stay admin-only.
The card: a `seats` table, admin-only writes through SECURITY DEFINER RPCs,
`create_course` (067) requires an active seat or admin, every existing editor
backfilled as an open-ended teacher seat, the house seat marked on the page.

## Decisions

1. **Table `author_seats`, one row per user.** `kind` ('house' | 'teacher'),
   `public_name` (1–80 characters), `expires_at` (NULL = open-ended), `notes`
   (≤ 1,000), `granted_by`, `created_at`, `updated_at`. No grants and no policy,
   like `teacher_student_links` (076): every read and write is a function. The
   card says "seats" and "user"; the table is `author_seats` so it cannot be
   mistaken for a seat in some other sense.
2. **Several house seats are allowed.** 0141 says "the partner holds the house
   seat", but the card does not ask for uniqueness and nothing reads it yet
   (TCH-011 will show "By <name>" on non-house seats). Marking works both ways
   (`set_author_seat_kind`), so the admin can move the mark. Revisit when
   TCH-011 needs "the" house teacher.
3. **"Active" is one SQL helper.** `_author_seat_active(user)`: a seat exists
   and `expires_at` is NULL or in the future. `author_seats_list()` returns
   `is_active` from the same expression; the page shows it and computes only the
   wording ("expires in N days"). TCH-008 reuses the helper to freeze the rest of
   Studio. This is not an entitlement rule: it decides who may create a course,
   not who may open a lesson.
4. **`create_course` re-emitted.** The gate is admin, or an active seat. A seat
   that exists but has lapsed answers `seat_lapsed` (mapped to a 403 with its own
   message), no seat answers `forbidden`. **Behaviour change:** 067 let any editor
   of any course create courses; now an editor who is not seated cannot. Every
   existing editor is backfilled, so none is turned away today, but a co-editor
   an admin grants *after* 082 (`grant_course_editor`, unchanged) does not get
   create rights until they are also given a seat. That is the card's "a user
   without a seat cannot create a course". `supabase/verify/067_editor_create_
   course.sql` seeded such an editor and failed after 082 until it was given a
   seat; it now seeds one, and the no-seat and lapsed cells live in 082's script.
5. **`_is_teacher` widened and Studio's gate with it.** 076 said TCH-007
   redefines `_is_teacher`. A seat now counts, lapsed or not (freezing is
   TCH-008's, and reads `_author_seat_active`, not this), so a seated teacher
   with no course yet can still mint a student link. For the same reason
   `getCourseAccess()` gained `hasSeat` (a boolean from `has_author_seat()`, the
   notes stay the admin's), `canEnterStudio()` replaced the repeated
   `!isAdmin && editableCourseIds.length === 0` in the layout and ten pages, and
   `isStudioEditor` (the account menu's Studio link and the post-sign-in landing)
   reads the seat too. Rejected: leaving the gates alone, because a teacher who
   has a seat and no course would get a 404 from the Studio that the seat exists
   to open. Both are strictly wider than before; nobody loses access. If the
   seat read fails (082 not applied), both fall back to the editor rows.
6. **No delete.** The card lists add, edit, extend and freeze. A mistaken seat is
   frozen. A date in the past is refused by `set_author_seat_expiry`
   (`expiry_in_past`): freeze is the way to end a seat, and a mistyped year must
   not lapse one silently. Freezing a seat that has already lapsed keeps its
   earlier date.
7. **Add by email needs an account.** `add_author_seat` finds the auth user by
   case-insensitive email (a deleted account is "not found") and answers
   `user_not_found` otherwise; it does not create accounts or send mail. A blank
   public name falls back to `profiles.display_name`, never `full_name`
   (CLAUDE.md, leaderboard rule, applied here because the name will be shown).
   It grants no `course_editors` row: a seat lets the teacher create courses, and
   creating one gives them the row (067).
8. **Backfill and export.** Every non-deleted `course_editors` holder gets an
   open-ended 'teacher' seat named from `display_name` (`'Teacher'` when blank),
   with `ON CONFLICT DO NOTHING` so re-applying never undoes an admin's freeze.
   A seat is data about the account, so `my_author_seat_export()` returns the
   caller's own seat, **notes included**, and the export document carries it as
   `author_seat` (format version 12 to 13); `delete_my_account` is re-emitted
   from 080 with one more DELETE, because the profile row stays (anonymised) and
   the public name and notes would otherwise outlive the account. The notes field
   says so ("Included in the teacher's data export if they ask for it").
   **The live privacy policy does not mention seats** (`rg -i seat
   docs/release/legal` finds nothing); OPS-025 should cover it before an external
   teacher is added. The house teacher is the owner's partner.
9. **The page.** `/studio/authors` is admin-only (Studio's 404 otherwise, even
   for a seated teacher), a nav entry "Authors" for admins, last in the list. One
   card per seat: name, a House/Teacher pill, a state pill (active, ending within
   7 days, lapsed), contact, expiry, courses (editor rows plus authored courses,
   counted once) and linked students (active links), the notes. Actions: Edit
   (name, notes), Extend (a date, with +1/+3/+12-month buttons that only fill the
   field, or no expiry), Freeze now (AlertDialog), Mark as house seat / Make a
   regular seat. An add form sits above the list, with a line that an external
   teacher should be added only once OPS-025 is decided (the card's note).
   `/api/studio/authors` validates the shape and relays the RPC's code; the RPCs
   check `is_admin` themselves.

## Not in this card

A lapsed seat freezing the rest of Studio (TCH-008), teacher-granted access
(TCH-009), listed courses (TCH-010), "By <name>" (TCH-011), a seat banner for
the teacher, and the teacher terms (OPS-025).

## Evidence

- `supabase/verify/082_author_seats.sql` on the local stack: `TCH-007 PASS:
  082 full protocol` (114 asserted cells; a copy with one expected value made
  wrong failed on that cell). Re-run after 082 and printing PASS: 067 (updated),
  068, 069, 070, 076, 077, 078, 079, 080, 081.
- Migration applied twice locally; the backfill NOTICE printed `2 distinct
  course_editors holders, 0 on deleted accounts skipped, 2 seats added`, then
  `0 seats added` on the second run.
- 360px: see the `docs/ui-decisions.md` entry.

## What would make us revisit this

- TCH-011 needs exactly one house teacher (Decision 2).
- The owner wants co-editors to create courses without a seat (Decision 4).
- OPS-025 decides notes should not be in a teacher's export (Decision 8).
- Seats need an audit trail beyond `updated_at` and `granted_by`.
