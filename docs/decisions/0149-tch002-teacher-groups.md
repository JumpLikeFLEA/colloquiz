# 0149 — TCH-002: a teacher groups their linked students

Status: built; migration 077 applied by the owner and `supabase/verify/
077_teacher_groups.sql` passed (owner-reported, 2026-10-16). Studio flows
driven end to end in Edge against the hosted project and measured at 360px
(see "Verified"). Decided unattended under `--no-approval`; each call below
is one the owner can overturn.

## Context

docs/decisions/0141 Decision 12: private, multi-membership groups of linked
students, a Learners filter now and a homework target in TCH-005. docs/
decisions/0144 Q2: the learner sees a group's name only in their data export.
Privacy 1.5 already says so (`docs/release/legal/privacy-policy.md`, the
"Private groups" row of the data table and section 5's third bullet), so no
legal change is needed; the "if the live text doesn't describe it, stop"
check did not fire.

## Decisions

1. **Two tables, no grants, SECURITY DEFINER functions only** (the 076
   pattern). `teacher_group_members` carries `teacher_id` so a composite FK
   `(group_id, teacher_id) -> teacher_groups(id, teacher_id)` makes "the
   member row sits under the group's own teacher" a constraint. The verify
   script tries a membership under the wrong teacher and expects the FK to
   refuse it.

2. **"A member must be a live linked student" is enforced at the only write
   path**, `add_teacher_group_members`, with `_teacher_linked()` (076). It is
   all or nothing: one id that isn't linked refuses the call and inserts
   nobody. A CHECK or trigger on the membership table was rejected: link
   state lives in another table, and the function is the sole writer.

3. **A link that ends empties that teacher's groups of that student through
   a trigger on `teacher_student_links`**, not by editing `end_teacher_link`.
   A link ends through `end_teacher_link` (either party), through
   `delete_my_account`'s DELETE, and through whatever TCH-008 adds (a lapsed
   seat); a trigger on the table covers all of them, so the rule has one
   home. Only that teacher's memberships go; the student's groups under other
   teachers stay (verify section 7).

4. **`delete_my_account` is re-emitted from 076** with one added DELETE
   (the caller's own groups; memberships cascade). A student's memberships go
   with their link rows through the trigger. The diff against 076's body is
   that one statement and its comment.

5. **Names:** 1 to 60 characters, trimmed, unique per teacher
   case-insensitively (`lower(name)` unique index). A duplicate is
   `name_taken`, shown as a sentence. The 60 and the trim are mirrored in
   `lib/teacherGroups.ts` (`GROUP_NAME_MAX`, `normalizeGroupName`), tested.

6. **Reads:** `teacher_groups_list()` (with member counts),
   `teacher_group_member_rows()` (ids only; labels come from
   `teacher_linked_students()` of 076) and, for the student,
   `my_group_memberships()` (group name, teacher's `display_name`, date; no
   other member, no count). One membership read feeds the group page, the
   learner page and the filter, so they cannot disagree.

7. **Learners Group filter** is URL-driven (`?group=<id>`, UUID
   allow-listed like `course`/`run`) and shows only when the teacher has a
   group. It narrows the roster AND the linked-students list. A group id that
   is not the caller's has no members in the caller's membership rows, so it
   shows nobody (`scopeRoster` treats a missing member set as "match
   nothing", tested), never everybody. A student who is linked but has no
   roster row (no activity yet) appears in the linked list under the filter,
   and not in the roster, which is activity-derived (0116).

8. **Where Studio edits groups:** the groups list and a group page
   (`/studio/learners/groups[/id]`: rename, delete, members with Remove, a
   checkbox list of the linked students not yet in it with Add), and a
   "Groups" checkbox section on a linked learner's page. That page is still
   reached through the roster (it 404s for a learner with no roster rows);
   making a linked student with no activity reachable is TCH-003's page, not
   this card's. The group page reaches every linked student regardless.

9. **The export note.** Wherever Studio names a group (create field, rename
   field, Add students, the learner page's Groups section) a muted line reads
   `GROUP_EXPORT_NOTE`: "Students see the names of groups they are in only in
   their data export." One constant, so the four places cannot drift.

10. **Export format 10:** `teacher_groups: [{ group_name, teacher_name,
    added_at }]` from `my_group_memberships()`; listed in the UI's "what's in
    it". Because the export route treats any failed read as a failed export,
    **the export route 500s until 077 is applied.** Apply 077 before this
    code is deployed to production.

11. **No learner-facing page shows a group.** Checked by grep: nothing under
    `app/(english)`, `app/(main)` or `app/components` reads
    `my_group_memberships` or `teacher_groups*`; only `app/api/account/export`
    does.

## Verified

Throwaway users (an admin teacher, a second admin teacher, two students) made
with the Admin API, driven in system Edge at 360x800 against `npm run dev`,
then deleted (leftovers: 0 groups, 0 links, 0 profiles). 32 checks passed:

- create, duplicate name in another case refused with a sentence, rename,
  add a student, untick from the learner page persists;
- Group filter narrows the linked list from 2 to 1; an unknown group id
  shows 0 linked students;
- the student's export is 200, format 10, lists `Evenings` with the teacher's
  name; `/my` shows no group name;
- the other teacher gets 404 on the group page;
- ending the link empties the group of that student.

`scrollWidth/innerWidth` 360/360 on: groups (empty), group page (no members),
group page (member + candidate), groups with a toast showing, Learners
(unfiltered), Learners (group filter), the learner page, the delete confirm
open, groups with one group.

Not reached: the Rename and Add dialogs have none (inline); a group with many
students at 360px.

## Revisit if

- A teacher needs more than ~500 students per add or more than a few dozen
  groups (no cap on group count exists).
- TCH-008 (lapsed seats) needs memberships kept rather than dropped when it
  freezes a teacher: today only an ended link drops them.
