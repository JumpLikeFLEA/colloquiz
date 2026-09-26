# Privacy Policy

**Colloquiz — https://colloquiz.app**

Version 1.0 · Last updated 2026-09-26

> **Source of truth.** This file is the canonical text. `app/(legal)/privacy/page.tsx`
> renders it; edit here first. Placeholders in `[BRACKETS]` must be filled before
> publication — a privacy policy without a real controller name and contact address is
> not compliant.
>
> **Not legal advice.** This is a standard-form GDPR/UK-GDPR policy written to match what
> the code actually does, verified against the repository. Have it reviewed if the
> service grows beyond a personal project.

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

We use an error-monitoring service that receives a technical report when something breaks
— a stack trace, the page you were on, and browser details. Session cookies and your
email address are stripped from these reports before they are sent.

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

Your browser's local storage is also used for small interface conveniences (for example a
remembered tab). That data never leaves your device.

### 3.5 What we do not collect

We do not collect special-category data (health, race, religion, political opinions,
biometrics, sexual orientation), payment details (the Service is free), or precise
location. Please do not put such information into free-text fields such as your display
name or feedback.

## 4. Why we process it, and our legal basis

| Purpose | Legal basis |
| --- | --- |
| Creating and running your account; providing quizzes, progress, groups and duels | **Contract** (Art. 6(1)(b)) — performance of our Terms of Service |
| Sending account email: confirmation, password reset | **Contract** |
| Keeping the Service secure, preventing abuse, moderating reported content | **Legitimate interests** (Art. 6(1)(f)) — running a safe service |
| Aggregate, non-identifying analytics to keep the Service working | **Legitimate interests** — we use privacy-preserving, cookieless tools, which we consider a minimal intrusion |
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

Your email address is **never** shown to other users.

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
| Error reports | Per the monitoring provider's retention, typically 30–90 days |

## 8. Your rights

Under the GDPR / UK GDPR you have the right to:

- **Access** your data, and to receive a **portable copy**. You can do this yourself,
  immediately: **Settings › Data and privacy › Export my data** produces a complete JSON
  file of your profile, results, achievements, group memberships and duel history.
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
- close your sign-in — you can no longer access the account, and neither can anyone else.

We **retain your quiz results and any questions or quizzes you contributed, in
anonymised form**, with no link back to you. We do this because other people's data
depends on it: group members' quiz histories, shared questions other learners are
answering, and aggregate subject statistics would otherwise be destroyed or corrupted.
This is permitted under Art. 17(3) and Art. 89 — anonymised data is no longer personal
data.

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
