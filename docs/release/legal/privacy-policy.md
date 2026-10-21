# Privacy Policy

**Colloquiz — https://colloquiz.app**

Version 1.7 · Last updated 2026-10-21

> **Source of truth.** This file is the canonical text. `app/(colloquiz)/(legal)/privacy/page.tsx`
> renders it; edit here first. Placeholders in `[BRACKETS]` must be filled before
> publication — a privacy policy without a real controller name and contact address is
> not compliant.
>
> **Not legal advice.** This is a standard-form GDPR/UK-GDPR policy written to match what
> the code actually does, verified against the repository. Have it reviewed if the
> service grows beyond a personal project.
>
> **Every change bumps the version and date.** Any edit to text that renders on
> /privacy (everything outside these maintainer blockquotes) raises the minor version
> and sets "Last updated" to the commit date, in the same commit. Section 13 promises
> this to users. See docs/decisions/0083-privacy-policy-versioning.md.
>
> **1.7 is a draft until the owner publishes it (OPS-026, docs/decisions/0184).** It
> describes the voice pipeline of docs/decisions/0156 as it will run. Before publishing,
> confirm each fact below is true of the code and the accounts; correct the text, not the
> fact, if it is not: (1) "opted out" at AssemblyAI is set in its Data Controls; (2) we call
> its EU endpoint and never `/v2/upload`; (3) the transcript is deleted at AssemblyAI right
> after we have it; (4) Anthropic receives the transcript, list and instruction only;
> (5) the "AI feedback" label is on every analysis; (6) the per-task and daily limits exist;
> (7) hosted `VOICE_ANALYSIS_MODE` is `off` until this is published.

---

## 1. Who is responsible for your data

Colloquiz ("the Service") is operated by **Gleb Chernov**, an individual based in
**Serbia**, acting as the **data controller**. Because the Service is offered to users in
the United Kingdom and the European Economic Area, we process personal data in accordance
with the **UK and EU General Data Protection Regulation** (which apply to us under Art.
3(2) GDPR) as well as Serbia's Law on Personal Data Protection.

Contact for any privacy matter, including exercising the rights in section 8:
**privacy@colloquiz.app**

We are a small independent project and are not required to appoint a Data Protection
Officer.

## 2. Scope

This policy covers the Colloquiz web application at https://colloquiz.app and its
associated API. It does not cover any third-party site you reach by leaving the Service.

## 3. What we collect

We collect only what the Service needs to function. There is no advertising, no
profiling for advertising, no sale of personal data, and no automated decision-making
that produces legal or similarly significant effects. The automatic feedback on a voice
recording (section 12) is not such a decision; section 12 says why.

### 3.1 Data you give us

| Data | Where it comes from | Why |
| --- | --- | --- |
| Email address | Sign-up, or your Google / Discord account if you use those | Account identity, sign-in, password reset, service email |
| Password | Sign-up (stored only as a salted hash by our authentication provider — we never see it) | Sign-in |
| Display name / full name | Optional, Settings › Account | Shown to you; your public name appears on leaderboards and to members of groups you join |
| City | Optional, Settings › Account | Shown on your own profile only |
| Profile picture | Optional, Settings › Account | Shown to you and to members of groups you join |
| Your age confirmation | Sign-up | We only offer the Service to people aged 13 and over |
| Feedback and question reports | When you submit them | To fix problems and moderate the question bank |
| Telegram identity — if you sign in with Telegram: an identifier Telegram issues for this Service (not your Telegram account number), your name and your username, as Telegram returns them | Sign-in with Telegram | Account identity and sign-in. Instead of an email address, a Telegram account has a username, which is what a course author sees |
| Voice recordings — if you are signed in and send one for a voice task, in any course: the audio | You, in the voice task | So you get automatic feedback on it (section 12), so the course author can listen and, in a cohort course, answer in writing, and so you can compare your first and last recording |
| Messages — if you write to a teacher you have linked to: what you write and, if you choose, a frozen copy of an exercise and your answer to it | You, in the messages page or the "Ask the teacher" link on an exercise | So you can ask your teacher a question about the content or a task. Only you and that teacher see it |
| Invite contact label — an author's note of a name and a contact (email or @telegram) for someone they invite to a course | The course author, not you | To send you the invite. Only the course author sees it |

### 3.2 Data created as you use the Service

| Data | Why |
| --- | --- |
| Quiz results — every attempt, the questions served, your answers, score and time | To show your progress, history and statistics, and to award XP and achievements |
| Experience points, level, daily streak, last activity date | Gamification features you can see on your dashboard |
| Achievements unlocked and when | Same |
| In-progress quiz sessions | So a quiz survives closing the browser and resumes where you left off |
| Group memberships and role, and questions or quizzes you author in a group | To run the collaborative-group features |
| Duel records — opponent, outcome, scores — and an internal skill rating | To run 1-v-1 duels and show a skill tier |
| Notifications and your notification preferences | To tell you about things that concern you inside the app |
| Quizzes you create or share, and share links you generate | To provide those features |
| English lesson practice-item attempts — each item you complete, its score, and which lesson block it belongs to | To score your lesson and show your progress, and, if you started before signing in, to carry that progress onto your account once you do |
| Your answers — for each practice item you complete while signed in, the answer you gave, in addition to its score | To show your answers back to you, to let a lesson resume where you left off, and, if you have linked to a teacher (section 5), to let that teacher see them |
| Teacher links — which teacher you linked to, when, and when and by whom it ended | To make the teacher features work only for people who chose them |
| Homework a linked teacher assigns you — the lesson or course, the optional due date and a note | To show you what your teacher asked for. A due date never locks a lesson |
| Private groups — a name a teacher gives to a set of their linked students, and whether you are in it | The teacher's own organisation of their students. You are not shown the group's name in the app |
| Calendar feed token — if you turn on "Subscribe in your calendar": a private web address for your dates | So your calendar app can show them. We store only a hashed form of the token |
| Telegram reminders — if you turn them on: the number of the Telegram chat where you pressed Start in our bot (your chat id), the language of the site and the time zone of your browser when you did, and when you turned reminders on and off | So the bot can message you about a course you joined. A one-hour link you press is stored only as a hashed token |
| English lesson opens — which lessons you opened while signed in, and when | To show you your progress, and to show the author of the course how learners move through it |
| Cohort enrolments — if you join a cohort course: the run, your tier, when you joined and, if it happened, when your access was ended (for example after a refund) | To give you access to the course and to open its lessons week by week |
| The author's written feedback on a voice task, and a final comment — if you join a cohort course | So you can read it under your recording |
| Voice transcripts and AI feedback — for a voice recording you send: a text transcript of what you said (including filler words and false starts), the automatic feedback made from it, which instruction version and AI model made it, and a count of how many recordings of each task you have sent | To show you the feedback, to compare your first and last recording, and to keep the limits on how many recordings get feedback |

**Your numeric skill rating is never shown to anyone, including you.** It is stored with
database permissions that make it unreadable outside the duel calculation itself; only a
coarse tier is displayed.

### 3.3 Technical data

Our hosting and database providers process standard server data — IP address, user agent,
request paths and timestamps — in their own operational logs, for delivering the Service
and for security. We do not build user profiles from this.

We use a privacy-focused, **cookieless** analytics service that records aggregate page
views and page-performance measurements. It does not use cookies, does not track you
across sites, and does not identify you.

For the English course platform, we also record a small number of usage events in our
own database: when someone opens the first page of a visit, starts or completes a
lesson, or signs up. Each event is tagged only with a coarse indication of how the
visitor arrived (for example, from an Instagram or Telegram post, or directly), and its
time is recorded only to the hour. These events are not linked to your account and carry
no cookie, fingerprint or other identifier. To remember the arrival channel for the rest
of a visit, your browser stores that single value in session storage, which is cleared
when you close the tab. If your browser sends a Global Privacy Control or Do Not Track
signal, we do not store it and record no arrival channel. To prevent abuse, your IP
address is briefly logged separately from the events, never stored with them, and
deleted automatically once it is no longer needed for that purpose.

Separately, when you create an account on the English course platform, we store with
your account, once, which course you signed up from (if you signed up from a course or
lesson page) and that same coarse arrival channel. This tells us which courses and
channels bring learners, so we can decide which courses to make next. It is recorded
only at sign-up and never updated afterwards, it is visible only to you (in your data
export) and to us, and it is deleted when you delete your account. If your browser
sends a Global Privacy Control or Do Not Track signal, nothing is recorded.

### 3.4 Cookies and similar technologies

We use **only strictly necessary cookies**:

| Cookie | Purpose | Lifetime |
| --- | --- | --- |
| `sb-*` (several) | Keep you signed in; refresh your session | Session / until sign-out or expiry |
| Theme preference | Remembers whether you chose light or dark mode | Persistent, local to your browser |

Because these are strictly necessary to provide a service you have explicitly requested,
they are exempt from the consent requirement under the ePrivacy Directive and its national
implementations. **We therefore do not show a cookie banner.** We set no advertising,
tracking or analytics cookies. If that ever changes, we will ask for your consent first.

Your browser's local storage is used for small interface conveniences (for example a
remembered tab), which never leave your device. For the English course platform
specifically, it also holds the scores of practice items you complete before you have an
account. Once you sign in, those scores are uploaded to your account and then cleared
from the browser.

When you sign up by email, those scores are also held briefly on our server, so they
reach your account even if you open the confirmation link on a different device or
browser. They are stored against a one-time code carried in your confirmation link; we
keep only a hashed form of that code. The stash is used up the first time the link is
opened. If the link is never opened, it stops working after 7 days and is deleted the
next time anyone signs up — not on a fixed schedule. The IP address of the request that
creates it is logged separately, only to prevent abuse, and deleted automatically after
one hour.

### 3.5 What we do not collect

We do not collect special-category data (health, race, religion, political opinions,
biometrics, sexual orientation), payment details, or precise location. We collect no
payment details: paid courses are paid to the author through a third-party platform, and
we never see your card or account details there. Please do not put such information into free-text fields such as your display
name or feedback.

## 4. Why we process it, and our legal basis

| Purpose | Legal basis |
| --- | --- |
| Creating and running your account; providing quizzes, progress, groups, duels and English lesson attempts | **Contract** (Art. 6(1)(b)) — performance of our Terms of Service |
| Sending account email: confirmation, password reset | **Contract** |
| Temporarily linking English lesson scores you earned before signing up to your account, via the confirmation link you request at sign-up | **Contract** (Art. 6(1)(b)) — a step you request in order to enter into the contract |
| Keeping the Service secure, preventing abuse, moderating reported content | **Legitimate interests** (Art. 6(1)(f)) — running a safe service |
| Aggregate, non-identifying analytics to keep the Service working | **Legitimate interests** — we use privacy-preserving, cookieless tools, which we consider a minimal intrusion |
| Signing you in with Telegram, if you choose it | **Contract** (Art. 6(1)(b)) — the sign-in method you asked for |
| Running a cohort course you joined: your enrolments (run and tier), opening its lessons week by week, recording which lessons you opened, and your voice recordings with the author's written feedback and final comment | **Contract** (Art. 6(1)(b)) — providing the course you joined |
| Sending your voice recording to a speech-to-text provider and an AI provider, and showing you the feedback, when you press Send on a voice task | **Contract** (Art. 6(1)(b)) — voice feedback is a feature of the Service that you start yourself by pressing Send; nothing is sent to either provider before that |
| A course author hearing the recordings you send, and reading their transcripts and the AI feedback, in any course you take while signed in | **Contract** (Art. 6(1)(b)) in a cohort course you joined. In a free course or a course you were given access to, **legitimate interests** (Art. 6(1)(f)) — letting the author see whether the feedback is wrong, hide it, and improve the course; you can object (section 8) |
| A course author seeing, in a cohort course you joined, your email or Telegram username, your invite's contact label, how you found the course, and your activity in it | **Contract** (Art. 6(1)(b)) — running the course you joined |
| Storing the answers you give while signed in, so they can be shown back to you and a lesson can resume | **Contract** (Art. 6(1)(b)) — saving your answers and scores as part of your progress is part of the Service, as Terms section 4 describes. Where a reader holds that this goes beyond what the contract needs, **legitimate interests** (Art. 6(1)(f)) — giving you your answers back. You can object (section 8) |
| A teacher you have linked to seeing your answers and scores, writing to you, grouping you and assigning you homework | **Contract** (Art. 6(1)(b)) — the teacher relationship you asked for by linking, after the app has told you what the teacher will see. We considered consent and did not choose it: a link made by claiming a run invite is a step to join a course you have chosen, so consent to it would not be freely given. You can leave a link at any time whatever the basis (section 5) |
| The calendar feed, if you turn it on | **Contract** (Art. 6(1)(b)) — a feature of the Service that you switch on yourself; turning it off, or replacing the address, stops it |
| Messaging you in Telegram about a course you joined, if you turn reminders on | **Contract** (Art. 6(1)(b)) — a feature of the Service that you switch on yourself by pressing Start in our bot; you turn it off with the button in the app, with /stop in the bot, or by blocking the bot |
| A course author seeing, in a free course, your email or Telegram username, how you found the course, and your activity in it, including lesson opens | **Legitimate interests** (Art. 6(1)(f)) — helping the author run and improve the course and reach its learners. You can object (section 8) |
| An author's contact label for you before you have claimed an invite | **Legitimate interests** — sending the invite you were offered |
| Recording which course and arrival channel you signed up from | **Legitimate interests** — learning which courses and channels bring learners, so we know which courses to make; one record per account, never updated, and not recorded under Global Privacy Control or Do Not Track |
| Complying with legal obligations | **Legal obligation** (Art. 6(1)(c)) |

You may object to any processing based on legitimate interests — see section 8.

## 5. Who we share it with

We do not sell your personal data and we do not share it for anyone else's marketing.

We use the service providers ("processors") listed in **[Subprocessors](./subprocessors.md)**.
Each is bound by a data processing agreement and may process your data only on our
instructions.

Some information is visible to other users by design:

- Your **public name** and XP appear on leaderboards, unless you turn this off in
  Settings.
- Your public name, and your profile picture if set, are visible to members of any group
  you join, and to anyone you duel.
- Questions and quizzes you author inside a group are visible to that group.

Your email address is not shown to other learners.

**Telegram reminders.** If you turn them on, the bot sends you messages through Telegram,
so Telegram receives the text of each message (course and lesson titles and a link) and
your chat id, and can see that you use the bot. Telegram is listed in the
[subprocessors](./subprocessors.md). We do not send Telegram anything else about you.

**Teachers you link to.** A "teacher" is a course author you choose to link to, by opening their student link or by claiming an invite they created. Before you confirm, the app tells you what they will see. If you link:

- the teacher sees, for lessons in courses they edit and for lessons and courses they assigned you as homework (for a single assigned lesson, that lesson only), each of your attempts with the answer you gave to each exercise, its score, and your best score for the lesson. They do not see your answers in other lessons or courses, your quiz results or any other Colloquiz data;
- you and the teacher can write to each other in one conversation. Nobody else reads it. You can attach a frozen copy of an exercise, and your answer to it if you tick that box;
- the teacher can put you in private groups, which are their own labels, not shown to you in the app (they are included in your data export), other learners or other teachers, and can assign you homework;
- you can leave at any time in My courses › Your teachers, and the teacher can remove you. When a link ends, the teacher can no longer see your answers or scores, you are taken out of their groups, and they can no longer assign you homework. The conversation stays readable to both of you and takes no new messages. Copies of an exercise or answer you attached stay in it until you delete your account.

Storing your answers does not depend on a link: we store them for every signed-in learner, and only you, and teachers you are linked to as described above, can read them. If you never link, no teacher sees them.

**Dates and the calendar feed.** A teacher can add dated events (such as a test day) to a run or a group; they contain nothing about you and are shown to the people in that run or group. If you turn on the calendar feed, your calendar app (for example Google or Apple Calendar) fetches your dates from a private address and keeps them under its own terms. Anyone who has the address can read your dates, so do not share it; you can replace it at any time, which stops the old one working.

**Course authors.** In this policy, "the course author" means anyone who edits the
course. The author of a course you take while signed in, free or paid, sees your email
address or Telegram username; your invite's contact label (if you were invited); how you
found the course (the course and the arrival channel); and your activity in that course:
lessons opened and completed, recordings sent and answered, and your last activity. The
purpose is to run the course and contact you about it. The author also sees, for each
exercise, the average score of signed-in learners, shown only when at least 5 learners
attempted it, and, unless you have linked to that author as a teacher (below), never the score of an individual learner. For a cohort course you joined
this rests on contract; for a free course it rests on legitimate interests, and you can
object (section 8).

**Voice recordings** are heard by you and the course author. This holds for every
course: a cohort course, a free course and a paid course you were given access to. The
author also reads the transcript and the AI feedback made from your recording, and can hide
feedback that is wrong. If you have linked to that author as a teacher (above), the same
applies. We access recordings only to run the Service. They are never used for promotion.
When you press Send, two providers listed in the [subprocessors](./subprocessors.md) handle
your recording, and no one else does:

- **AssemblyAI** turns the audio into a transcript. We give it a short-lived private address
  from which it reads the audio. We send it no name or email; the address contains random
  identifiers.
- **Anthropic** receives the transcript, the author's list of expressions for the task and
  our instruction, and returns the feedback. It does not receive the audio or your account
  details.

Both providers receive what you say, so please do not say anything in a recording that you
would not want written down, such as health details or other people's personal data.

Neither provider is allowed to use what we send it for anything but providing the service to
us, and we have turned off the use of it for training where the provider offers that switch
(section 12). If you are not signed in, a recording stays on your device and is never
uploaded: no provider receives it.

**Invite contact labels** are seen only by the course author. **Cohort enrolments** and
**lesson opens** are visible to you and to the course author. The author's **written
feedback and final comment** are visible to you and to the author. If you sign in with
Telegram, Telegram is a provider of that sign-in, listed in the subprocessor list, and
your **Telegram identity** is visible to us and, as a username, to the author of a course
you take.

We will disclose data if legally compelled to do so, and will tell you unless prohibited.

## 6. Where your data is held

The Service is hosted in the **European Union** (Dublin, Ireland). Our database and
authentication provider stores your data in **Ireland (`eu-west-1`)**.

We (the operator) are based in **Serbia**, a country outside the EEA for which the
European Commission has not issued an adequacy decision. Some subprocessors are also
established outside the EEA. Where personal data is transferred to us or to them, the
transfer relies on the European Commission's **Standard Contractual Clauses** and, where
applicable, the **EU–US Data Privacy Framework**. Details are in the
[subprocessor list](./subprocessors.md). In particular, **AssemblyAI** transcribes
recordings through its European endpoint, which it says processes audio and transcripts in
the EU and stores them in the EU, but it stores its account and usage data in the United
States; and **Anthropic**, which handles transcripts, does not state where it processes them,
so we treat that as a transfer outside the EEA under the Standard Contractual Clauses in its
data processing addendum.

## 7. How long we keep it

| Data | Retention |
| --- | --- |
| Account and profile data | Until you close your account |
| Quiz results, achievements, XP | Until you close your account; afterwards retained in **anonymised** form (no name, no email, not linked to you) so that aggregate statistics and other users' group and duel records stay intact |
| In-progress quiz sessions | Deleted on completion, on abandonment, or after a period of inactivity |
| Notifications | Deleted when your account is closed |
| Feedback and question reports | Up to 24 months, so we can track recurring problems |
| Provider server logs | Per the provider's own policy, typically days to a few weeks |
| English lesson practice attempts | Until you close your account; then **deleted outright**, not anonymised — see section 9 |
| Signup source (the course and arrival channel you signed up from) | Until you close your account; then **deleted outright** |
| Telegram identity | Until you close your account; then erased with your profile details |
| Voice recordings | A recording you replace is deleted when you replace it. In a cohort course, all recordings are deleted 6 months after the end of the run. In any other course, a recording is deleted 6 months after you sent it. In both cases a recording is also deleted when you delete your account, whichever comes first |
| Voice transcripts and AI feedback | Deleted together with the recording they were made from, at the same time and for the same reasons. The feedback on a later recording can quote short passages of your first recording; those quotes are part of that later feedback and are deleted with it |
| What AssemblyAI and Anthropic keep | AssemblyAI: we ask it to delete each transcript as soon as we have received it, and its documentation says it begins deleting audio 24 hours after a request and finishes within 48 hours; it keeps some metadata for logging and billing. Anthropic: its published policy is to delete inputs and outputs within 30 days of receipt, and to keep them for up to 2 years if a request is flagged as a violation of its usage policy. |
| The author's written feedback and final comment | Until you close your account; then **deleted outright** |
| Invite contact labels | Once you claim the invite, kept with your enrolment and deleted when you delete your account. A label never claimed is deleted 30 days after the invite expires or is revoked |
| Cohort enrolments | Until you close your account; then **deleted outright** |
| English lesson opens | Until you close your account; then **deleted outright** |
| Your answers | Until you close your account; then **deleted outright** |
| Teacher links | Until you close your account; then **deleted outright**. Ending a link does not delete your answers |
| Messages, with any exercise or answer attached | Until you close your account; then **deleted outright** |
| Private groups and homework naming you | Until the link ends or you close your account, whichever comes first; then removed from the teacher's groups and homework |
| Calendar feed token | Until you replace it or close your account |
| Telegram reminders (chat id, language, time zone, dates) | Until you close your account; then **deleted outright**. Turning reminders off, /stop or blocking the bot stops the messages and marks the link as stopped; the row stays until you close your account, or until you turn reminders on again. A link you did not use is deleted when you turn reminders off or make a new one |
| Cross-device claim stash (pre-signup lesson scores held server-side) | Deleted when the confirmation link is first used; if never used, unusable after 7 days and deleted at the next sign-up after that |
| IP address logged when creating a cross-device claim stash | 1 hour |

## 8. Your rights

Under the GDPR / UK GDPR you have the right to:

- **Access** your data, and to receive a **portable copy**. You can do this yourself,
  immediately: **Settings › Data and privacy › Export my data** produces a complete JSON
  file of your profile, results, achievements, group memberships, duel history,
  English lesson practice attempts with the answers you gave, the course and channel you signed up from, your teacher links, your conversations with teachers, the names of any private groups a teacher has put you in, the homework assigned to you, whether you have a calendar feed (never its token), your Telegram reminders link (chat id, language, time zone and dates), the
  lessons you opened, your cohort enrolments, your Telegram identity, and the author's
  written feedback and final comment. The export includes a copy of your voice
  recordings with their transcripts and AI feedback, and an invite contact label is included once you have claimed it.
- **Rectify** inaccurate data — Settings › Account.
- **Erase** your data ("right to be forgotten") — **Settings › Data and privacy › Delete
  my account**. See section 9 for exactly what this does.
- **Restrict** or **object to** processing based on legitimate interests.
- **Withdraw consent** where we rely on it (we currently do not rely on consent for
  anything except optional profile fields you choose to fill in).
- **Complain** to a supervisory authority. You may complain to the authority in your
  country of residence — a list is at https://edpb.europa.eu/about-edpb/board/members_en
  — or, in the UK, to the ICO at https://ico.org.uk.

To exercise any right not available in the app, email privacy@colloquiz.app. We respond
within one month.

## 9. What deleting your account does

When you delete your account we, immediately and irreversibly:

- erase your name, public name, city and profile picture;
- remove your notifications, notification preferences and any in-progress quiz;
- remove you from all leaderboards;
- erase your English lesson practice attempts and the answers stored with them outright — see the contrast below;
- end your teacher links, delete your conversations with teachers in full (both sides, with anything attached), take you out of their groups and homework, and delete your calendar feed token and your Telegram reminders link;
- erase the record of which course and channel you signed up from;
- erase your voice recordings with their transcripts and AI feedback, the author's written feedback and final comment, your
  cohort enrolments, your lesson opens, the invite contact label kept with your
  enrolment, and your Telegram identity;
- close your sign-in — you can no longer access the account, and neither can anyone else.

We **retain your quiz results and any questions or quizzes you contributed, in
anonymised form**, with no link back to you. We do this because other people's data
depends on it: group members' quiz histories, shared questions other learners are
answering, and aggregate subject statistics would otherwise be destroyed or corrupted.
This is permitted under Art. 17(3) and Art. 89 — anonymised data is no longer personal
data. Your English lesson practice attempts, and the course data listed above, are different:
apart from the per-exercise averages described in section 5, which include no one's
identity, nothing in the Service reads your attempts, answers or recordings except you,
the author of the course and, for attempts and answers, a teacher you have linked to. No
other user's record depends on them, so they are deleted outright rather than kept
anonymised. Once deleted, your attempts no longer count toward those averages.

If you would prefer a different outcome, email privacy@colloquiz.app and we will discuss what
is possible.

## 10. Security

Access to your data is enforced at the database level by row-level security policies, so
one account cannot read another's records even if the application had a bug. Passwords are
salted and hashed by our authentication provider and are never visible to us. Traffic is
encrypted in transit (TLS). Administrative access is limited to the operator.

No system is perfectly secure. If a breach affects your rights and freedoms, we will
notify the relevant supervisory authority within 72 hours and tell you directly where
required.

## 11. Children

The Service is for people aged **13 and over**. You must confirm your age when you sign
up. We do not knowingly collect data from anyone under 13. If you believe a child under 13
has created an account, email privacy@colloquiz.app and we will delete it.

If you are under 18, a parent or guardian should be aware of your use of the Service.

## 12. AI systems

We use AI systems in two places. Neither makes a decision about you.

**Quiz questions.** Some questions in the library are drafted with the help of an AI system
and then reviewed. **No personal data of yours is sent to that system** — it receives only
a subject and topic, and returns candidate questions. Your answers, results and profile are
never used for this.

**Feedback on a voice recording.** When you are signed in and press Send on a voice task,
two AI systems work on your recording:

1. A speech-to-text service (**AssemblyAI**) writes down what you said, keeping the filler
   words and false starts, because the feedback is about them.
2. A language model (**Anthropic's Claude**) reads that transcript and returns feedback:
   which of the expressions the author listed you used, one main error, what worked, a
   goal for next time, and, for a final recording, how it compares with your first.

Every piece of this feedback is labelled **"AI feedback"**, and it can be wrong; the
transcript it is made from can contain mistakes too. It is not a grade, it is not
part of your lesson score, and it does not decide whether you complete a lesson or a course.
A cohort course keeps the author's own written feedback alongside it. The course author can
read it and hide feedback that is wrong; you then see that it was withdrawn and can send
again. We limit how many recordings of one task get feedback and how many a learner gets in
a day.

**Why this is not an "automated decision" under Art. 22 GDPR.** Art. 22 covers a decision
based solely on automated processing that has legal or similarly significant effects on
you. This feedback decides nothing: it grants or refuses no access, no certificate, no
price and no mark, and nothing in the Service changes for you whatever it says. It is
advice for your own study, which you can ignore or replace by recording again.

**Training.** We do not use your recordings, transcripts or feedback to train any model, and
we have not allowed our providers to. Anthropic's Commercial Terms say it may not train
models on customer content from its services. AssemblyAI's documentation says it does not use
files for training if you use its European servers or have opted out; we use that endpoint
and have opted out, and the opt-out applies only to what is sent after it is set.

**Anonymous visitors** are not affected: without an account a recording stays on your
device.

## 13. Changes to this policy

We will post any change here with a new version number and date. For a change that
materially affects your rights, we will tell you in the app or by email before it takes
effect. Version 1.7 added voice recordings in every course and the AI feedback in
section 12.

---

_Questions? privacy@colloquiz.app._
