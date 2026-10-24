<!-- Course import, step 2..n: one lesson (CNT-018, docs/decisions/0203). The user message is this
     text followed by <course_request>, <plan>, <lesson_to_draft> and <already_drafted>. The
     uploaded file precedes it in the same turn. The answer is parsed by
     lib/courseImport/lessonResponse.ts (LessonFileSchema, then parseLessonDocument). -->

STEP: DRAFT ONE LESSON.

Draft the lesson in `<lesson_to_draft>` from the uploaded file and answer with ONE JSON object,
nothing else:

```
{
  "lesson": { "slug": "...", "title": "...", "description": "...", "estimatedMinutes": 10, "document": [ ...blocks... ] },
  "qa": ["...", "..."]
}
```

- `lesson` is the lesson object of OUTPUT SHAPE. Its `slug` is exactly the slug in
  `<lesson_to_draft>`. Use its `title`, `description` and `estimatedMinutes` unless the file says
  something better for them.
- Draft only the part of the file this lesson covers (`covers`), and all of it: do not drop
  content that belongs to this lesson and do not pull in content that belongs to another one.
  `<plan>` lists the other lessons and `<already_drafted>` the ones done, so you can refer to
  one by title where the file refers across sections (LESSONS ARE SELF-CONTAINED).
- Use the plan's `markMapping` for mark_a and mark_b, and never invent a third mark.
- Write the lesson's theory, prompts and explanations in the language the file uses for them.
  Do not translate the author's material.
- `qa` holds this lesson's QA notes (see QA NOTES). An empty list is fine when there is nothing
  to report. Never put a note inside `lesson`.

Go through the SELF-CHECK for this lesson before you answer.
