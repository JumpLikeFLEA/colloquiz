/**
 * Learner-facing chrome strings for the English (Alliengll) surface that
 * have ONE fixed language each. The lesson page (player buttons, lesson
 * band, completion card, signup offer, paid-lesson notice) is ENGLISH
 * (owner, 2026-10-07, docs/decisions/0080 Decision 5, reversing the
 * 2026-09-24 Russian-chrome rule for lessons); the 404 and the page
 * metadata stay Russian (docs/handoff.md, "Audience and language"). Not an
 * i18n layer: no locale selection, no library, no fallback. The landing page (app/(english)/landingCopy.ts), the course page
 * (courses/[courseSlug]/courseCopy.ts) and the footer (footerCopy.ts) follow
 * the shared EN/RU toggle instead and keep their strings beside the page
 * (docs/decisions/0080).
 *
 * Colloquiz's own chrome (0018 Decision 5) is untouched and stays English —
 * nothing here is imported outside app/(english)/.
 *
 * Bundle note (docs/decisions/0079, "Budget"): any Client Component that
 * imports this module ships the WHOLE object (~2.2 KB gzip) to the browser.
 * On the lesson page that's unavoidable (the player is client-side). Keep it
 * out of client components that render on `/` or the course page. That is
 * why the footer is server-rendered and handed to `EnglishFooterGate` as
 * props, and why the error boundary's four strings live in
 * ./errorCopy.ts.
 */

export const alliengllCopy = {
  siteName: "Colloquiz",

  // docs/decisions/0079 D9: the course and lesson pages' header wordmark —
  // the same literal display text as the landing header's (0078), not a
  // rename. siteName above (and the `%s · Colloquiz` title template) stays.
  wordmark: "Alliengll",

  landing: {
    heroTitle: "Английский без напряжения",
    heroSubtitle:
      "Короткие курсы для тех, кто хочет понимать и говорить по-английски — на телефоне, в удобном темпе.",
    ctaPrimary: "Начать бесплатно",
    catalogueLink: "Все курсы",
  },

  // catalogue.title / .empty moved to app/(english)/landingCopy.ts
  // (2026-09-28 landing exception — those strings are now bilingual and
  // live only on the landing page, the catalogue's only home today).
  catalogue: {
    freeSampleBadge: "Бесплатно",
  },

  // ── Lesson page: English, fixed (docs/decisions/0080 Decision 5) ──────
  // Pending owner/partner review. Where SHELL-011 (a02dc32) had replaced an
  // earlier English label with Russian, the earlier wording is reused. The
  // course page's strings live in app/(english)/courses/[courseSlug]/
  // courseCopy.ts and follow the EN/RU toggle instead.

  player: {
    submit: "Check",
    next: "Next",
    retry: "Try again",
    backToCourse: "Back to course",
    // docs/decisions/0079 D6: the pill above every exercise, "Exercise 3 of 8".
    exerciseLabel: "Exercise",
    exerciseOf: "of",
    // The lesson band's size line ("12 min · 8 exercises") and the
    // completion card's countdown ("3 exercises left").
    exercises: { one: "exercise", other: "exercises" },
    minutesLabel: "min",
    // docs/decisions/0079 D5: the lesson band's "Lesson 2 of 8" and the
    // sticky progress strip's accessible name.
    lessonLabel: "Lesson",
    lessonOf: "of",
    progressLabel: "Lesson progress",
    why: "Why?",
    hide: "Hide",
    true: "True",
    false: "False",
    dragReorderHint: "Hold and drag the handle to reorder.",
    tapToMatch: "Tap to match",
    returnToPool: "Return to pool",
    allStatementsSorted: "All statements sorted",
    correctAnswerPrefix: "Correct",
    gapLabel: "Gap",
    clear: "Clear",
    allWordsPlaced: "All words placed",
    // docs/decisions/0088: the note above a lesson a signed-in learner has
    // already attempted, so a fresh page doesn't read as lost progress.
    previousBestLabel: "Your best",
    previousBestNote: "Answer again to try to beat it. Your best score is kept.",
  },

  theory: {
    exampleLabel: "Example",
    selfCheckPlaceholder: "Your answer",
    selfCheckModelAnswerLabel: "Model answer",
    selfCheckShowModelAnswer: "Show model answer",
    videoTitle: "Lesson video",
    videoPlayAriaLabel: "Play video",
    videoClickToPlay: "Click to play video",
  },

  completion: {
    title: "Lesson complete",
    scoreLabel: "Your score",
    nextLesson: "Next lesson",
    reviewTitle: "Answer review",
    // docs/decisions/0079 D7: "17 of 20" under the score, and the card shown
    // until every exercise is answered ("3 exercises left").
    scoreOf: "of",
    remainingSuffix: "left",
    remainingBody: "Answer every exercise and your score will appear here.",
  },

  signupOffer: {
    title: "Save your progress",
    body: "Sign up so your results aren’t lost.",
    cta: "Sign up",
    signIn: "Already have an account? Sign in",
    dismiss: "Not now",
    emailLabel: "Email",
    passwordLabel: "Password",
    submit: "Create account",
    submitting: "Creating account…",
    orDivider: "or",
    oauthGoogle: "Google",
    oauthDiscord: "Discord",
    inAppBrowserNotice:
      "Google and Discord sign-in don’t work in the Instagram or Telegram in-app browser. Sign up with email, or open this page in your regular browser.",
    // The Colloquiz sign-up form's existing consent wording
    // (app/(colloquiz)/(auth)/AuthScreen.tsx), not new legal copy.
    consentPrefix: "I am 13 or over and agree to the",
    consentJoiner: "and",
    termsLink: "Terms of Service",
    privacyLink: "Privacy Policy",
    consentRequired: "Confirm that you are 13 or over and agree to the terms.",
    checkEmailTitle: "Check your email",
    checkEmailBody: "We sent you a confirmation link. Open it to finish signing up.",
    genericError: "Something went wrong. Please try again.",
  },

  // ── Russian, fixed ────────────────────────────────────────────────────
  notFound: {
    title: "Страница не найдена",
    body: "Такой страницы не существует или она была перемещена.",
    backHome: "На главную",
  },

  // PLAY-006: a lesson whose metadata is visible (per docs/handoff.md,
  // "preview, precisely") but whose content the caller isn't entitled to —
  // paid, not bought. Plain state only; the real preview screen is M3.
  // English: it renders on the lesson page (0080 Decision 5).
  notAvailable: {
    body: "This lesson opens when you buy the course.",
  },

  // PLAY-006's error boundary strings moved to lib/alliengll/errorCopy.ts
  // (docs/decisions/0079, "Budget"): the boundary is a Client Component that
  // ships with every page, and importing this object there put all of it in
  // the client JS of `/`.

  // The footer's strings moved to app/(english)/footerCopy.ts (docs/
  // decisions/0080): the footer follows the EN/RU choice on course pages.
} as const;
