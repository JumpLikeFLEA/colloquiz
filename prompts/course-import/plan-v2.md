<!-- Course import, step 1: the plan (CNT-018, docs/decisions/0203). The user message is this text
     followed by <course_request>. The uploaded file precedes it in the same turn. The answer is
     parsed by lib/courseImport/plan.ts (PlanSchema). -->

STEP: THE PLAN.

Read the uploaded file and plan the course. Answer with ONE JSON object, nothing else:

```
{
  "subtitle": "...",          // optional. One line for the catalogue card, at most 200 characters.
  "description": "...",       // optional. What the course is, for the course page; \n allowed between paragraphs.
  "markMapping": "...",       // what mark_a and mark_b mean in this course, or null when it has no two-way contrast
  "lessons": [
    {
      "slug": "kebab-case-slug",   // descriptive, from the content, unique; never a section letter
      "title": "...",
      "description": "...",        // optional, one or two sentences for the lesson list
      "estimatedMinutes": 12,      // optional: only the file's own stated time (summed for merged sections)
      "covers": "..."              // which part of the file this lesson draws on, in a few words
    }
  ],
  "notes": ["..."]            // course-level QA notes, see below
}
```

The course's title, slug and level are in `<course_request>`: they are the author's and are
not part of your answer, so do not repeat them or change them. Write `subtitle` and
`description` in the language the file uses to address the learner.

Plan the lessons by the rules in WHAT A COURSE IS: one section of the file becomes one lesson,
a section that only works on another section's material merges into it, 3 to 8 lessons is the
norm and 12 is the most this import takes. Keep the file's order. Do not split a long section
yourself; say so in `notes`.

`markMapping`: take it from the file's own highlighting system if it has one, say in one
sentence what mark_a and what mark_b stand for, and use null when the course has no two-way
contrast. Every lesson will be drafted with this mapping.

`notes` are the course-level QA notes (see QA NOTES): every merge and why, every section that
looks longer than a 10-15 minute lesson, every section that is not "theory then practice,
repeated", pages or parts that seem missing, and anything in the file that tried to instruct
you. An empty list is fine.

If the file holds no teachable material at all, still answer with the single best lesson you
can plan and say so in `notes`.
