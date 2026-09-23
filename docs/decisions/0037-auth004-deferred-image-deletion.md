# 0037 — AUTH-004: image deletion deferred to lesson save, not upload

## Context

AUTH-004's acceptance line reads: "Replacing an image deletes the old object
only after the new one is saved." The avatar precedent
(`app/(main)/app/settings/AccountSection.tsx`, `handleAvatarPicked`) deletes
the replaced object immediately after the upload succeeds and the `profiles`
row is updated — because avatar upload writes straight to the database; there
is no separate "save" step to wait for.

The lesson editor is different: `LessonContentEditor` holds the whole
document as client state (`blocks`) and only persists it on an explicit Save
click, which runs CNT-003 and `save_lesson_version`. An image field's
`onChange` only updates that in-memory state. If the old object were deleted
immediately on upload (mirroring the avatar flow literally), then an author
who uploads a replacement image and then discards the edit — closes the tab,
navigates away, or the CNT-003 validation on Save rejects the block for an
unrelated reason — would have deleted an object the lesson's last SAVED
(possibly published) version still references, corrupting a live lesson for a
reason the author never confirmed.

## Decision

Deletion of a replaced image is deferred until the SAVE that replaces it
actually succeeds, not fired on upload:

- `uploadLessonImage` (`LessonContentEditor.tsx`) uploads the new object
  immediately (so the picker can show it right away) but only *queues* the
  previous object's path in `pendingImageDeletions` state — it does not call
  `.remove()`.
- `save()` deletes every queued path (best-effort, matching the avatar
  precedent's "a failure here costs a stray file, not correctness") only
  after `save_lesson_version` has returned success, then clears the queue.

Cost: an uploaded-but-never-saved replacement image becomes an orphan object
in the bucket (nothing ever queues or deletes it, since the replacement was
never confirmed). This is accepted as the same class of tradeoff the avatar
precedent already accepts for its own best-effort cleanup — a stray file, not
a correctness bug — and is strictly better than the alternative of deleting a
live lesson's referenced image on an unconfirmed edit.

## What would make us revisit it

- If orphaned uploads from abandoned edits turn out to accumulate enough to
  matter, a periodic sweep (objects in `lesson-images` not referenced by any
  `lesson_versions.document`) would clean them up without changing this
  card's save-gated deletion rule.
- If the editor ever gains autosave (persisting `blocks` without an explicit
  Save click), this decision's premise — "only a confirmed Save should delete
  anything" — still holds; the queue should drain on whatever action becomes
  the actual persistence point, not on upload.
