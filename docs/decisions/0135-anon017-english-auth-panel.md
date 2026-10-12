# 0135 — English-surface sign-in panel copy language (ANON-017)

Context: a learner sent to `/login?next=<lesson>` met the quiz-app panel.
Options for the new panel's language: (1) fixed English, like lesson chrome;
(2) follow the saved EN/RU cookie, as the landing and course pages do;
(3) Russian. The form fields are English in every case.

Decision (owner, 2026-10-12): option 1, fixed English. No cookie read in
`/login`, so no extra strings or server work there.

Measured: `npm run budget` `/login` 287.5 KB of 380 KB; 287.4 KB with the
change stashed. English routes identical before and after (same run output).

Revisit if the partner reports Russian-speaking learners bouncing at this screen.
