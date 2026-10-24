# 0205 — OPS-030: legal drafts for importing a course from a file

Status: DRAFTS ONLY. Nothing under `docs/release/legal/` is changed by this card; the owner
reviews and publishes (the OPS-029 precedent, 0201). Decided unattended under `--no-approval`;
the drafts are proposals, the owner can overturn any of them. This is not legal advice.

## Context

Since CNT-018 (0203), an author with the admin-given import grant can upload a PDF, DOCX,
Markdown or text file in Studio, and Claude drafts a course from it. The live policy (privacy
1.8, subprocessors 1.5) names Anthropic for one purpose only: the AI feedback on a voice take.
`COURSE_IMPORT_MODE` is read from the environment and fails closed (anything but `on` is off,
`lib/courseImport/mode.ts`); 0203 Decision 6 keeps it `off` in production until both documents
say so. Migration 103 is applied to hosted (0203, CNT-018 "Hosted"), so the only switch left is
the variable.

The people affected are the grant holders (authors), not learners: no learner data is sent.

## What the code does (each line checked against the source named, not against 0203's summary)

| Fact | Source |
|---|---|
| **A PDF** is uploaded once to Anthropic's Files API under the fixed file name `source.pdf` (the author's own file name is not sent), referenced by id in every call, and deleted when the import ends. | `lib/courseImport/pipeline.ts` (`prepare` step, `cleanup`), `lib/courseImport/claude.ts` (`uploadFile`, `deleteFile`) |
| **DOCX, Markdown and text** are never uploaded as files. Their text (DOCX converted to HTML on our side, images dropped) is sent inside the request. | `lib/courseImport/source.ts`, `buildMessages` in `claude.ts` |
| Besides the file, the request carries our instructions (`prompts/course-import/*.md`), the **title, address (slug) and level** the author typed, and, in later steps, the plan and the lessons the model itself already wrote. | `lib/courseImport/request.ts` |
| **No user id, name or email** is put in a request. | `request.ts` header comment; `CourseRequest` is `{ title, slug, level }`; the upload name is a constant |
| The file's own content is sent whole, whatever it contains. The author chooses it. | `buildMessages` (the document block carries the entire text or file) |
| Our copy: a private bucket `course-imports` (32 MiB limit), and one `course_imports` row per import holding status, title, slug, level, the plan, the drafted lessons, the QA report, one usage entry per model call (tokens, model), the instruction version and a failure code. Owner-read RLS, no lease or lessons column readable by the client. | migration 103 §1, §3 |
| Both copies of the file (bucket object, Anthropic file) are removed when the import is done or failed. A daily sweep (`53 3 * * *`) fails an import still unfinished after 24 hours, removes any copy a finished import still names after 10 minutes, and removes bucket objects older than 24 hours that no import refers to. A failed deletion is retried the next day. | `pipeline.ts` line 145 and `cleanup`; `app/api/cron/course-import-sweep/route.ts`; migration 103 `course_import_sweep`; `vercel.json` |
| The `course_imports` rows are **not** purged on a schedule. They go when the account is deleted (`delete_my_account`, 103 §8, which also returns the object names and Anthropic file ids for the route to remove). | migration 103 §8; no other delete in 103 |
| The drafted course (title, lessons) is ordinary course content in the author's account, a draft, unlisted, never published by the import. | 0203 Decision 3 |
| Caps: 3 imports per 24 h and 10 per 30 days per user, admins exempt. | migration 103 §2 |
| The import form already says, before the author starts, that the file is sent to Anthropic. | `docs/ui-decisions.md` (CNT-019 entry) |

### Provider facts, with sources (read 2026-10-24)

| Fact | Source | Wording |
|---|---|---|
| A file uploaded to the Files API persists until it is deleted (or an `expires_at` we do not set: our upload sends no expiry). | https://platform.claude.com/docs/en/build-with-claude/files, "File lifecycle" | "Files persist until you delete them with the `DELETE /v1/files/{file_id}` endpoint or they reach their `expires_at`." |
| After deletion the file may still sit in a running call, and its remains follow Anthropic's retention policy. | same page | "Files are inaccessible through the API shortly after deletion, but they may persist in active Messages API calls and associated tool uses." and "Files that users delete will be deleted in accordance with Anthropic's data retention policy" |
| **The Files API is not eligible for zero data retention.** | same page, front matter | `zdr: not-eligible` |
| Files are workspace-wide, not per user. We never take a file id from a user. | same page, "Uploaded files are accessible to your entire workspace" | our ids come from our own upload (`pipeline.ts`), stored server-side |
| Retention of inputs and outputs: 30 days; up to 2 years if flagged. | the Anthropic article already cited in subprocessors 1.5 (privacy.claude.com, dated 2026-07-01) | not re-read for this card; the quote is 0184's |
| Training: "Anthropic may not train models on Customer Content from Services." | Commercial Terms, as cited in 0184 | not re-read for this card |

The Files API page was fetched through a summarising tool, so the quoted lines are the tool's
quotes; the owner should open the links before relying on them (the 0184 caveat).

**Not established:** whether the "30 days" retention covers Files API content in the same way as
messages (the page points to the retention policy but does not say). The draft therefore says what
we do (delete it ourselves when the import ends) and what Anthropic's published policy says, and
does not promise a number for the Files copy alone.

## Drafts

### privacy-policy.md

**§3.1, new row after "Voice recordings":**

> Files you import — if you are an author with the import permission and you upload a file to
> draft a course (PDF, Word, Markdown or plain text): the file, and the title, address and
> level you enter | You, in Studio | So the service can draft a course from your file for you to
> review and edit

**§3.2, new row after "Voice transcripts and AI feedback":**

> Course imports — for each import: its status, the plan and the lessons the AI wrote, a report
> of what it changed or flagged, how many tokens each AI call used and which model and
> instruction version made them, and the reason if it failed | To show you its progress and the
> report, to apply the limits on how many imports you can start, and so we can fix problems

**§4 Art. 6 table, new row after the voice-sending rows:**

> Sending a file you chose to import to an AI provider, and drafting a course from it, when you
> press Start import | **Contract** (Art. 6(1)(b)) — a feature of the Service that an
> administrator enabled for your account and that you start yourself; nothing is sent before you
> press the button

**§5, new paragraph after the voice paragraph:**

> **Course imports.** If you are an author with the import permission and you import a file,
> **Anthropic** receives everything in it: the whole text of a Markdown, text or Word file (Word
> images are left out), or the whole PDF, together with the title, address and level you
> entered, our instructions, and the text the model has already written for the same import. It
> does not receive your name, email, account identifier or the name of your file. Because it
> receives the file as it is, please do not import a file that contains personal data of other
> people, such as names and contact details of students, or health details. The result is a
> draft course that only you and the other editors of that course see; nothing is published
> until you publish it. Anthropic is listed in the [subprocessors](./subprocessors.md).

**§7 retention table, three new rows after "What AssemblyAI and Anthropic keep":**

> The file you import (our copy, and the copy at Anthropic for a PDF) | Deleted when the import
> finishes or fails. If that deletion fails, or an import stops, a daily clean-up removes it:
> an import that has not finished after 24 hours is failed, and a leftover copy is removed at the
> next daily run, so no later than about two days after you uploaded it
>
> Import records (status, plan, drafted lessons, report, token counts) | Until you delete your
> account. The draft course itself is course content and is kept as long as the course is kept
>
> What Anthropic keeps of an imported file | We delete the file at Anthropic through its API
> when the import ends. Anthropic's published policy is to delete inputs and outputs within 30
> days of receipt, and to keep them up to 2 years if flagged as a violation of its usage
> policy. Files deleted through its API may remain in a call that is running at that moment

**§9, add to the list of what is deleted outright**, after the voice recordings item:

> your course imports, with the file copies they still hold, and the plan, lessons and report
> they stored;

**§12 AI systems:** "We use AI systems in two places." becomes "three places." Add after the
voice feedback block, before "Training":

> **Drafting a course from your file.** If you are an author with the import permission, a
> language model (**Anthropic's Claude**) reads the file you import and drafts a course: lessons,
> exercises, answer keys and explanations. A draft can be wrong. It is a draft course in your
> account that you read and edit before you publish it, and the import shows a report of what it
> changed or could not do. It involves no information about learners and decides nothing about
> anyone.

The **Training** paragraph already says Anthropic's Commercial Terms bar training on customer
content; extend its first sentence from "your recordings, transcripts or feedback" to "your
recordings, transcripts, feedback or imported files".

**§13**, add: "Version `<next>` added course imports from a file for authors who have the
permission (section 5, 7 and 12)." **Header:** `Version <next> · Last updated <publication date>`.
`<next>` is 1.9 if the OPS-029 draft (0201) has not been published first, otherwise 1.10; the
two drafts both touch §3.2, §5 and §13, so whichever is applied second is merged by hand.

### subprocessors.md

**Anthropic row, role cell:** "Writes the AI feedback on a voice take from its transcript — **only
for a take a signed-in learner sends**" becomes "Writes the AI feedback on a voice take from its
transcript — **only for a take a signed-in learner sends** — and drafts a course from a file an
author imports in Studio — **only for an author who has the import permission and starts an
import**".

**Data cell**, append: "For a course import: the whole file (a PDF is uploaded to its Files API
under the fixed name `source.pdf`; Word, Markdown and text are sent as text), the title, address
and level the author typed, our instructions, and the text the model wrote in earlier steps of the
same import. No name, email, account identifier or file name."

**Where it appears in the code**, append: "`lib/courseImport/*` (the import), `COURSE_IMPORT_MODEL`;
the same `ANTHROPIC_API_KEY`. We delete an uploaded PDF through the Files API when the import ends,
and a daily sweep (`app/api/cron/course-import-sweep`) removes any left behind. The Files API is not
eligible for zero data retention (its documentation, read 2026-10-24); the retention and training
sentences in this row apply to imports as to voice."

**Location and transfer-basis cells:** unchanged (outside the EEA, module two SCCs).

**"Not a subprocessor of personal data" table**, Anthropic row: no change (it is about question
drafting, still true).

**Change log**, append: "`<next>` (`<date>`) Anthropic gains a second purpose: drafting a course
from a file an author imports (docs/decisions/0203, 0205). New data (an author's uploaded file),
new purpose, same recipient. After launch it needs the in-app notice of Terms §10 for the authors
concerned (docs/decisions/0095 Option A). `<next>` is 1.6, or 1.7 if the OPS-029 draft is
published first."

**Header:** version `<next>`.

### terms-of-service.md

No change proposed. §5 "Acceptable use" already forbids uploading content the user has no right to
share (the "upload content you do not have the right to share" bullet), which covers a file an
author imports.

### teacher-terms-draft.md (for when the owner finalises it)

One sentence is worth adding, not drafted into any live file: that an imported file is sent to
Anthropic, and must not contain personal data of students or anyone else. The import form already
says the first half before the author starts.

## Decisions

1. **Drafts live here, not in `docs/release/legal/`** (0201 Decision 1; the card says nothing there
   changes without the owner).
2. **Contract, not consent.** The author starts the feature on purpose, after being told on the form
   that the file goes to Anthropic. It is the same basis the policy gives the voice feature and the
   Telegram reminders.
3. **Say what the file can contain.** The one risk the code cannot remove is that the author's file
   holds someone else's personal data (a class list, a dialogue with real names). The draft puts the
   warning in §5 and the form already says where the file goes. It does not claim the service
   screens files.
4. **Do not promise a Files-copy retention number.** See "Not established".
5. **Materiality (0095), recommendation only.** It adds a purpose for an existing recipient and a data category
   (uploaded documents) that exists only for grant holders; an admin gives each grant by hand. Before launch, per 0095
   Decision 1: version bump, no notice. Once real teachers hold the grant, the admin tells each one
   when giving it; the in-app banner of Terms §10 is the fallback. Learners are not affected, so
   no learner-wide banner is proposed. Whether production has real accounts is not recorded in the
   repo; the owner states it.
6. **The privacy policy's audience.** The policy says "you" throughout; a grant holder is a user of
   the Service, so no separate teacher section is added (0201 Decision 5).

## For the owner

- Which of the drafts you accept, and the publication date and version for the headers.
- Order against OPS-029's draft (0201): both are unpublished; the second one applied is merged by
  hand into the first's §3.2, §5 and §13.
- Whether production has real accounts now (Decision 5).
- Before `COURSE_IMPORT_MODE=on` in production (card acceptance 2, yours):
  - the policy and subprocessors above are published;
  - the Anthropic account whose key production uses is under the Commercial Terms (this is already
    an OPS-027 item for voice);
  - the Vercel production project has `ANTHROPIC_API_KEY` and `CRON_SECRET` set. Not checked from
    this repo: `COURSE_IMPORT_MODE` and the others live in Vercel, not in the working tree.
    Without `CRON_SECRET` the sweep refuses everything, so leftover files would never be cleaned;
  - an Anthropic workspace for production that shares nothing else is worth considering: Files are
    visible to every key in the workspace (the warning on the Files API page).
- Evidence for the second acceptance line (one import on production reaching `done`) can only exist
  after that; this card does not claim it.

## What would make us revisit it

- The pipeline starts sending anything about the author (a name, an email, the file's own name) or
  about a learner: the §5 sentence is then false.
- A format is added that is uploaded as a file rather than as text, or images are sent (DOCX images
  are dropped today, 0203 Decision 2).
- Anthropic's Files API gains zero-data-retention eligibility, or its retention for files is stated
  separately from messages.
- `course_imports` rows are purged on a schedule, or the report is shown to anyone but the author.
