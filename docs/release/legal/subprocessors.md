# Subprocessors

**Colloquiz — https://colloquiz.app** · Version 1.5 · Last updated 2026-10-23

These are the third parties that process personal data on our behalf. The
[Privacy Policy](./privacy-policy.md) links here. Keep this file current — adding a
processor is a change users are entitled to know about.

Each entry names what the provider actually touches in *this* codebase, so the list can be
verified rather than trusted.

---

## In use today

| Provider | Role | Personal data processed | Location | Transfer basis | Where it appears in the code |
| --- | --- | --- | --- | --- | --- |
| **Supabase** (Supabase Inc.) | Database, authentication, file storage | Everything: email, password hash, profile, results, groups, duels, notifications, avatars | Ireland (`eu-west-1`), EU | SCCs where applicable | `lib/supabase/*`, all `supabase/migrations/**` |
| **Vercel** (Vercel Inc.) | Application hosting, CDN, serverless execution | Request data in operational logs: IP, user agent, path, timestamp. Processes all request payloads in transit | Region `dub1` (Dublin, IE) | EU–US DPF / SCCs | `vercel.json` |
| **Resend** | Outbound email — **account mail only** (sign-up confirmation, password reset) | Email address, and the message content | EU/US | EU–US DPF / SCCs | Configured as custom SMTP **inside Supabase Auth**; the app holds no API key and sends no mail of its own — see `lib/feedbackNotify.ts` |
| **Google** (Google Ireland Ltd.) | OAuth sign-in — **only if the user chooses it** | Email address, account identifier, name and picture as returned by the provider | EU/US | EU–US DPF / SCCs | `app/(auth)/AuthScreen.tsx`, `app/auth/callback/route.ts` |
| **Discord** (Discord Inc.) | OAuth sign-in — **only if the user chooses it** | Same as above | US | SCCs | `app/(auth)/AuthScreen.tsx`, `app/auth/callback/route.ts` |
| **Telegram** (Telegram Messenger Inc.; EEA representative: European Data Protection Office, Brussels) | Sign-in, and reminder messages — **only if the user chooses them** | An identifier Telegram issues for this Service (not the Telegram account number), name and username, as Telegram returns them (printed in `docs/decisions/0098`). For reminders: the Telegram chat id of a user who pressed Start in the bot, and the text of the reminder messages sent to it (course and lesson titles, a link) | Outside the EEA | Sign-in: not applicable, we send Telegram no personal data; you sign in on Telegram's own page and Telegram sends us the fields listed. Reminders: we send the chat id and message text to Telegram's Bot API, only for users who turned reminders on; the transfer basis is for the owner to confirm before launch | `app/(colloquiz)/(auth)/AuthScreen.tsx`, `app/components/lesson-player/RegistrationOffer.tsx`, `app/auth/callback/route.ts`, `app/api/telegram/webhook/route.ts`, `lib/telegram/send.ts` |
| **AssemblyAI** (AssemblyAI Inc., New York, US) | Speech-to-text for voice tasks — **only for a take a signed-in learner sends** | The audio of the take, read from a short-lived private address we give it, and the transcript it returns with word timings. No name or email is sent; the address contains random identifiers. AssemblyAI stores account and usage data, and may process file names through its own subprocessors, in the US | Audio and transcripts: the EU endpoint `api.eu.assemblyai.com`, which its documentation says processes and stores them in AWS regions in the EU. Account and usage data: US. Its staff outside the EU may access data for an incident or a support request | AssemblyAI's DPA (effective 2026-01-22) forms part of its Terms of Service and needs no separate signature; it applies the EU SCCs (deemed entered into) or the Data Privacy Framework where the recipient is certified, and the UK SCCs | `lib/voice/*` (the transcription step), `ASSEMBLYAI_API_KEY`. Training: its documentation says files sent to its European servers are not used for training; every take goes there. Retention: we ask it to delete each transcript once received, and the audio it read goes with it; a transcript that is never deleted is deleted automatically from 30 days (its documentation) |
| **Anthropic** | Writes the AI feedback on a voice take from its transcript — **only for a take a signed-in learner sends** | The transcript, the task and the course author's list of expressions for it, and our instruction; for a final take, also the learner's first transcript and the goal and main error from its analysis. No audio, name, email or account identifier | Not stated in its DPA; treated as outside the EEA | Anthropic's DPA is incorporated into its Commercial Terms (module two EU SCCs, UK and Swiss addenda; it does not mention the Data Privacy Framework). The Commercial Terms are accepted on first use of the API | `lib/voice/*` (the analysis step), `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL_VOICE`. Training: the Commercial Terms say "Anthropic may not train models on Customer Content from Services." Retention: inputs and outputs are deleted within 30 days, or kept up to 2 years if flagged as a usage-policy violation (Anthropic privacy centre, article dated 2026-07-01) |
| **Discord** (webhook) | Operator notification when new in-app feedback arrives | The feedback text, which may contain whatever the user typed | US | SCCs | `lib/feedbackNotify.ts`, `FEEDBACK_DISCORD_WEBHOOK_URL` — optional; feedback is stored either way |

## Added as part of the 1.0 release

| Provider | Role | Personal data processed | Location | Transfer basis | Status |
| --- | --- | --- | --- | --- | --- |
| **Vercel Analytics + Speed Insights** | Aggregate page views and Web Vitals | None identifying. **Cookieless** — this is why the Service needs no cookie banner | EU | — | ☑ live — `<Analytics />` + `<SpeedInsights />` in `app/layout.tsx` (`@vercel/analytics`, `@vercel/speed-insights`) |

## Not a subprocessor of personal data

| Provider | Why it is listed | Why it is not a subprocessor |
| --- | --- | --- |
| **Anthropic**, for quiz-question drafting only | Drafts candidate quiz questions | Receives a subject and topic only. **No user data of any kind is sent**, and no user data is used for training. See `lib/generator/llm.ts` — the payload is authored content, never a profile, result or answer. The same company is a subprocessor for voice feedback (above) |

---

## Change procedure

1. Add or amend the row here **before** the provider goes live.
2. Confirm a DPA is in place (usually accepting the provider's standard terms).
3. Bump the version and date at the top of this file and of the Privacy Policy.
4. If the change materially affects users, notify them in-app per Terms §10.

Change log: 1.1 (2026-10-08) added Telegram. No notice was needed: production has no
real accounts before launch (docs/decisions/0095, Decision 1). 1.2 (2026-10-14)
Telegram sign-in is live: its legal entity, its transfer basis, and the fields it
actually returns, which include no profile picture (docs/decisions/0098). Removing a
field that was never received is not material (0095).
1.3 (2026-10-18) Telegram gains a messaging role: reminder messages to users who linked the bot
(COH-010, docs/decisions/0173). This is a new data category, so after launch it needs the
in-app notice of Terms §10 (docs/decisions/0095 Option A).
1.4 (2026-10-21) AssemblyAI added and Anthropic moved into the processor list, for voice
feedback on every course (docs/decisions/0156, 0184). A new data category and a new
recipient, so after launch it needs the in-app notice of Terms §10 (docs/decisions/0095
Option A). The providers' terms were read on 2026-10-21 from their public pages.
1.5 (2026-10-23) Corrected the AssemblyAI and Anthropic rows: what Anthropic receives for a
final take, AssemblyAI's EU regions and support access, retention and training
(docs/decisions/0184).

> Before go-live (OPS-027) the owner confirms that the AssemblyAI and Anthropic accounts
> whose keys production uses are under the providers' standard terms (the DPA is part of
> them), and records the date in docs/decisions/0184.
