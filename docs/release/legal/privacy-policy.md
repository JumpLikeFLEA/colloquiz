# Privacy Policy

**Colloquiz — https://colloquiz.app**

Version 1.2 · Last updated 2026-10-08

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
that produces legal or similarly significant effects.

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
| Telegram identity — if you sign in with Telegram: your Telegram account identifier, name, username and profile picture, as Telegram returns them | Sign-in with Telegram | Account identity and sign-in. Instead of an email address, a Telegram account has a username, which is what a course author sees |
| Voice recordings — if you send one for a voice task in a cohort course: the audio | You, in the voice task | So the course author can listen and answer in writing, and so you can compare your first and last recording |
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
| English lesson opens — which lessons you opened while signed in, and when | To show you your progress, and to show the author of the course how learners move through it |
| Cohort enrolments — if you join a cohort course: the run, your tier, when you joined and, if it happened, when your access was ended (for example after a refund) | To give you access to the course and to open its lessons week by week |
| The author's written feedback on a voice task, and a final comment — if you join a cohort course | So you can read it under your recording |

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
| A course author seeing, in a cohort course you joined, your email or Telegram username, your invite's contact label, how you found the course, and your activity in it | **Contract** (Art. 6(1)(b)) — running the course you joined |
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

**Course authors.** In this policy, "the course author" means anyone who edits the
course. The author of a course you take while signed in, free or paid, sees your email
address or Telegram username; your invite's contact label (if you were invited); how you
found the course (the course and the arrival channel); and your activity in that course:
lessons opened and completed, recordings sent and answered, and your last activity. The
purpose is to run the course and contact you about it. For a cohort course you joined
this rests on contract; for a free course it rests on legitimate interests, and you can
object (section 8).

**Voice recordings** are heard by you and the course author. We access them only to run
the Service. They are never used for promotion. Practice recordings in free or anonymous
lessons stay on your device and are never uploaded.

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
[subprocessor list](./subprocessors.md).

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
| Voice recordings | A recording you replace is deleted when you replace it. All recordings are deleted 6 months after the end of the run, or when you delete your account, whichever comes first |
| The author's written feedback and final comment | Until you close your account; then **deleted outright** |
| Invite contact labels | Once you claim the invite, kept with your enrolment and deleted when you delete your account. A label never claimed is deleted 30 days after the invite expires or is revoked |
| Cohort enrolments | Until you close your account; then **deleted outright** |
| English lesson opens | Until you close your account; then **deleted outright** |
| Cross-device claim stash (pre-signup lesson scores held server-side) | Deleted when the confirmation link is first used; if never used, unusable after 7 days and deleted at the next sign-up after that |
| IP address logged when creating a cross-device claim stash | 1 hour |

## 8. Your rights

Under the GDPR / UK GDPR you have the right to:

- **Access** your data, and to receive a **portable copy**. You can do this yourself,
  immediately: **Settings › Data and privacy › Export my data** produces a complete JSON
  file of your profile, results, achievements, group memberships, duel history,
  English lesson practice attempts, the course and channel you signed up from, the
  lessons you opened, your cohort enrolments, your Telegram identity, and the author's
  written feedback and final comment. The export includes a copy of your voice
  recordings, and an invite contact label is included once you have claimed it.
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
- erase your English lesson practice attempts outright — see the contrast below;
- erase the record of which course and channel you signed up from;
- erase your voice recordings, the author's written feedback and final comment, your
  cohort enrolments, your lesson opens, the invite contact label kept with your
  enrolment, and your Telegram identity;
- close your sign-in — you can no longer access the account, and neither can anyone else.

We **retain your quiz results and any questions or quizzes you contributed, in
anonymised form**, with no link back to you. We do this because other people's data
depends on it: group members' quiz histories, shared questions other learners are
answering, and aggregate subject statistics would otherwise be destroyed or corrupted.
This is permitted under Art. 17(3) and Art. 89 — anonymised data is no longer personal
data. Your English lesson practice attempts, and the course data listed above, are different:
nothing else in the Service reads another learner's attempts or recordings, so there is
no one else's data at stake, and they are deleted outright rather than kept anonymised.

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

## 12. Automated content generation

Some questions in the library are drafted with the help of an AI system and then reviewed.
**No personal data of yours is sent to that system** — it receives only a subject and
topic, and returns candidate questions. Your answers, results and profile are never used
for this, and are not used to train any model.

## 13. Changes to this policy

We will post any change here with a new version number and date. For a change that
materially affects your rights, we will tell you in the app or by email before it takes
effect.

---

_Questions? privacy@colloquiz.app._
