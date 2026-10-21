# 0184 — OPS-026: legal revision for AI voice feedback and recordings on every course

Status: drafted 2026-10-21 (OPS-026, #230). Privacy 1.7, Terms 1.3 and
Subprocessors 1.4 are written in `docs/release/legal/`; migration
`095_terms_1_3.sql` is written and not applied. **Nothing is published until the
owner says so.** The owner has not reviewed this text, and it is not legal
advice.

## Context

0156 Decision 16 made the legal text a gate for go-live. Before this revision the
live files said three things that 0156 makes untrue (`git show HEAD:docs/release/
legal/privacy-policy.md`, §12 and the voice rows; `subprocessors.md`, "Not a
subprocessor of personal data"): no personal data reaches an AI system,
recordings are collected only in cohort courses and free practice never leaves
the device, and Anthropic is not a subprocessor.

## What changed

- **Privacy 1.7.** The voice row (§3.1) covers any signed-in learner on any
  course; §3.2 gains transcripts and AI feedback; §4 gains two rows (sending to
  the providers, contract; the author hearing and reading free-course takes,
  legitimate interests); §5 names the two providers and what each receives; §6
  gives the transfer position of each; §7 gives retention (6 months after
  sending for a non-cohort take, run end + 6 months for a cohort take, quotes of
  the first take kept in the later feedback only as long as that feedback) and
  what each provider keeps; §8 and §9 add transcripts and feedback to export and
  erasure; §12 is rewritten as "AI systems", with the training position and why
  Art. 22 does not apply. A maintainer checklist (a blockquote, so it never
  renders) lists seven facts to confirm before publishing.
- **Terms 1.3.** One paragraph in §4, "Voice tasks and AI feedback": it comes
  from an AI system, can be wrong, is not a grade, does not count toward a score
  or completion, and may be limited.
- **Subprocessors 1.4.** AssemblyAI and Anthropic rows with data sent, location,
  transfer basis and DPA; Anthropic keeps a second row, scoped to question
  drafting, in the old table.
- **Migration 095.** `current_terms_version()` returns '1.3' (guard
  `scripts/check-terms-version.mjs` prints that it agrees).

## Provider facts, with sources (all read 2026-10-21)

| Fact | Source | Wording |
|---|---|---|
| AssemblyAI DPA needs no signature | https://www.assemblyai.com/docs/faq/can-i-sign-a-dpa-agreement-with-assemblyai.md | "you automatically agree to a Data Processing Addendum (DPA) as part of our terms of service." |
| Its DPA, transfers, sub-processors | https://www.assemblyai.com/legal/data-processing-addendum (effective 2026-01-22, per the page) | EU SCCs "deemed entered into", DPF where certified, UK SCCs; general authorisation of sub-processors with 10 days' notice; "primary processing operations take place in the United States" |
| EU endpoint | https://www.assemblyai.com/docs/pre-recorded-audio/select-the-region | "The EU endpoint (`api.eu.assemblyai.com`) processes your audio and transcript data in the European Union." and "Audio and transcript data will be stored in the endpoint region you select." Exclusions: account and usage data in the US; file names may be processed by CrowdStrike and Datadog (US); support staff outside the region may access data when debugging |
| EU production region | https://www.assemblyai.com/docs/faq/where-do-production-and-backups-reside | "Our production server resides in AWS US West 2, AWS EU West 1." Backups: not stated |
| Training | https://www.assemblyai.com/docs/data-retention-and-model-training | "Only certain files submitted to the API, as permitted by the applicable contract, are used for model training." and "We will not use files you submit for model training if you are subject to a Business Associate Addendum, are utilizing our European servers, or if you have opted out from model training." |
| Opt-out | https://assemblyai.com/docs/data-controls | "Opt Out of Data Sharing for Model Improvement Program"; "Opt-out changes are forward-looking only"; only Owner or Admin roles can change it |
| AssemblyAI audio retention | same data-retention page | no TTL or BAA: "Deletion process begins at 24 hours and is at most 48 hours." Customer-initiated deletion: "Deleted when customer initiates deletion request." |
| Anthropic DPA | https://www.anthropic.com/legal/data-processing-addendum | "is incorporated into and forms part of the Anthropic Commercial Terms of Service"; EU SCC module two (and three); UK and Swiss addenda; no mention of the Data Privacy Framework; Anthropic "is Customer's processor"; deletion within 30 days of termination; does not say where processing happens; sub-processors at https://www.anthropic.com/subprocessors |
| Anthropic training | https://www.anthropic.com/legal/commercial-terms (effective 2025-06-17, per the page) | "Anthropic may not train models on Customer Content from Services." The DPA itself says nothing about training. |
| Anthropic retention | https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data (dated 2026-07-01) | "we automatically delete inputs and outputs on our backend within 30 days of receipt or generation"; up to 2 years for inputs and outputs flagged under the Usage Policy, 7 years for classifier scores |

These pages were fetched through a summarising tool; each quoted line above was
returned as a verbatim quote, but the page text itself was not saved. The owner
should open the links before relying on them.

### Not established

- **That either account has accepted the DPA.** AssemblyAI's DPA is part of its
  Terms of Service and Anthropic's is incorporated into its Commercial Terms, both
  by use. What is on file is whatever the owner's accounts record. The
  acceptance, with date, is the owner's to confirm; subprocessors.md says so.
- **That AssemblyAI's opt-out is set.** It is a dashboard toggle for an Owner or
  Admin. Until set, the text "have opted out" is untrue.
- **Where AssemblyAI stores audio that it fetches from a URL we give it.** The
  EU-endpoint page speaks of "audio and transcript data" stored in the endpoint
  region, and the 0182 bench found that `/v2/upload` returns a CDN address that
  resolves to S3 us-west-2. 0182 Decision 2 avoids the upload route for that
  reason. Whether a fetched URL is stored in the EU is not stated. Ask AssemblyAI
  in writing before go-live (0182 Decision 2 already asks); the answer may change
  privacy §6.
- **Where Anthropic processes a request.** Neither the DPA nor the pages read
  say. The text treats it as outside the EEA.
- **The Anthropic sub-processor list.** `trust.anthropic.com/subprocessors` returned
  no content to the fetch tool. The owner should read it.
- **Whether Anthropic's Commercial Terms or retention article apply to
  `claude-sonnet-5-5` unchanged.** One search result claimed some 2026 models carry
  a mandatory 30-day retention and no zero-retention option; no primary source was
  found for it, and the 30-day figure above matches it anyway. Unverified.

## Decisions

Made unattended; each is the owner's to overturn.

1. **Privacy change is material; the Terms change is not.** 0095's table counts a
   new voice data category as material. The Terms paragraph adds a feature
   description and takes nothing away, so Terms 1.3 follows 0144's reasoning for
   1.2: no 14-day notice under §10. The version bump alone is the notice for
   Terms.
2. **The notice for the privacy change is the 0095 Option A banner, which does not
   exist.** 0144 found "no banner mechanism exists in the code" and left it as a
   new card; I re-checked on 2026-10-21 with `rg -il "policy_notice|legal_notice|LegalNotice|material change" app lib`
   and it found nothing. This card does not build it
   (scope growth). It is needed only if real accounts exist when the text
   goes live (0095's owner fact: none at 2026-10-08, restated 2026-10-16). I did
   not probe production for accounts. **Proposed card:** "In-app notice of a
   material legal change" (acceptance: a dismissible banner keyed on a version
   stored per profile, shown on the English and Colloquiz surfaces, bundle
   budget stated).
3. **The "AI feedback" label is VOICE-014's.** The label sits on the learner's view,
   which does not exist yet (`scripts/board/backlog.mjs`, VOICE-014's acceptance
   already reads "labelled 'AI feedback'"). Privacy §12 promises it; the
   maintainer checklist makes it a publish condition. Art. 50 of the EU AI Act is
   the reason the card gives; I did not check its application date or whether
   that provision fits a chatbot-style feedback tool, so the text says "labelled"
   and claims no Art. 50 compliance.
4. **Why GDPR Art. 22 does not apply, as written in §12.** The feedback grants or
   refuses nothing, is not a grade, has no effect on score, completion, access or
   price, and the learner can ignore or redo it. That is my reading, not a legal
   opinion; if any later card makes the analysis gate a certificate or a
   cohort outcome, this reasoning stops holding.
5. **Legal basis.** Sending to the providers: contract, because the learner starts it
   by pressing Send. The author hearing a free-course take: legitimate interests,
   the same basis and objection route as §4's existing free-course author row. A
   cohort course: contract, as before.
6. **The text names two requirements the pipeline must meet**, which later cards own.
   If one is not met, the text changes, not the other way round:
   - VOICE-012 deletes the transcript at AssemblyAI right after receiving it
     (0182 Decision 3: "200, then GET shows `Deleted by user.`") and uses the EU
     endpoint and a signed URL, never `/v2/upload`;
   - Anthropic receives the transcript, the author's list and the instruction only.
   One item is open: the voice bucket's object path is `<course id>/<user id>/…`
   (`supabase/migrations/060_voice_submissions.sql`, policy lines 120–121), so a
   signed URL contains the learner's UUID, and AssemblyAI says file names may reach
   its US sub-processors. 0182 Decision 3 says "nothing sent to AssemblyAI carries a
   learner ID". The two disagree. The text says only that the address "contains
   random identifiers", which is true; VOICE-012 should either copy to an opaque key
   or the owner accepts a UUID as a path segment. Not decided here.
7. **I left out the 180 s cap and output checks** (0182 Decisions 5 and 10) from the
   public text. They are recommendations from one bench, not yet built. Add them
   when VOICE-012/013 ship them.
8. **The Vercel env print is not done.** Acceptance line 4 asks for `VOICE_ANALYSIS_MODE`
   to be printed from the Vercel environment list. That reads the production project,
   which CLAUDE.md reserves to the owner. What I can show from the repo:
   `parseVoiceAnalysisMode` treats unset as `off` (0183 Decision 10), so a production
   project without the variable is off. Printing the list is left to the owner or to
   OPS-027.

## To publish

1. Read the three files and the checklist in `privacy-policy.md`; edit freely.
2. Confirm the six items under "Not established" that you can; for any you cannot,
   say so and I will soften the text.
3. Apply `095_terms_1_3.sql` through the hosted-apply gate when publishing, not
   before.
4. Decide on the notice card (Decision 2).
5. Then OPS-027's go-live checks apply.

## Revisit when

- AssemblyAI answers the audio-storage question, or its opt-out/EU training wording
  changes.
- Anthropic's retention or training terms change, or a ZDR arrangement is made.
- A later card lets the analysis gate anything (Decision 4).
- OPS-025 onboards external teachers, who then hear free-course recordings
  (0156 "Revisit when"): §5 already says "the course author", and `teacher-terms-draft.md`
  must agree.
