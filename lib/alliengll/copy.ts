/**
 * Every learner-facing chrome string for the English (Alliengll) surface —
 * landing, catalogue, course page, player buttons, completion screen, signup
 * offer, not-found — in one place, in Russian (docs/handoff.md, "Audience and
 * language", 2026-09-24 delta). This is one surface written in one language,
 * not an i18n layer: no locale selection, no library, no fallback.
 *
 * Colloquiz's own chrome (0018 Decision 5) is untouched and stays English —
 * nothing here is imported outside app/(english)/.
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

  // docs/decisions/0079: the course page redesign. New strings pending
  // owner/partner review, same as 0078's landing copy.
  course: {
    backToCatalogue: "Все курсы",
    startFirstFree: "Начать первый бесплатный урок",
    startCourse: "Начать курс",
    allFree: "Весь курс бесплатно",
    progressAttempted: "пройдено уроков",
    progressAverage: "средний результат",
    progressOf: "из",
    lessons: { one: "урок", few: "урока", many: "уроков", other: "урока" },
    exercises: { one: "задание", few: "задания", many: "заданий", other: "задания" },
    minutesLabel: "мин",
    freeBadge: "Бесплатно",
    bestScoreLabel: "Лучший",
    aboutTitle: "О курсе",
    lessonsEyebrow: "Программа",
    lessonsTitle: "Уроки курса",
    noFreeLesson: "Скоро появятся бесплатные уроки",
    noLessons: "Уроки скоро появятся — загляните позже.",
  },

  player: {
    submit: "Проверить",
    next: "Далее",
    retry: "Пройти ещё раз",
    backToCourse: "Назад к курсу",
    // docs/decisions/0079 D6: the pill above every exercise, "Задание 3 из 8".
    exerciseLabel: "Задание",
    exerciseOf: "из",
    // docs/decisions/0079 D5: the lesson band's "Урок 2 из 8" and the
    // sticky progress strip's accessible name.
    lessonLabel: "Урок",
    lessonOf: "из",
    progressLabel: "Прогресс урока",
    why: "Почему?",
    hide: "Скрыть",
    true: "Верно",
    false: "Неверно",
    dragReorderHint: "Удерживайте и перетаскивайте, чтобы изменить порядок.",
    tapToMatch: "Нажмите, чтобы сопоставить",
    returnToPool: "Вернуть в список",
    allStatementsSorted: "Все утверждения распределены",
    correctAnswerPrefix: "Правильно",
    gapLabel: "Пропуск",
    clear: "Очистить",
    allWordsPlaced: "Все слова расставлены",
  },

  theory: {
    exampleLabel: "Пример",
    selfCheckPlaceholder: "Ваш ответ",
    selfCheckModelAnswerLabel: "Пример ответа",
    selfCheckShowModelAnswer: "Показать пример ответа",
    videoTitle: "Видео к уроку",
    videoPlayAriaLabel: "Воспроизвести видео",
    videoClickToPlay: "Нажмите, чтобы посмотреть видео",
  },

  completion: {
    title: "Урок завершён",
    scoreLabel: "Ваш результат",
    nextLesson: "Следующий урок",
    reviewTitle: "Разбор ответов",
  },

  signupOffer: {
    title: "Сохраните свой прогресс",
    body: "Зарегистрируйтесь, чтобы результаты не потерялись.",
    cta: "Зарегистрироваться",
    dismiss: "Не сейчас",
    emailLabel: "Email",
    passwordLabel: "Пароль",
    submit: "Создать аккаунт",
    submitting: "Создаём аккаунт…",
    orDivider: "или",
    oauthGoogle: "Google",
    oauthDiscord: "Discord",
    inAppBrowserNotice:
      "Вход через Google и Discord не работает во встроенном браузере Instagram или Telegram — зарегистрируйтесь по email или откройте страницу в обычном браузере.",
    consentPrefix: "Мне есть 13 лет, я согласен(на) с",
    consentJoiner: "и",
    termsLink: "Условиями использования",
    privacyLink: "Политикой конфиденциальности",
    consentRequired: "Подтвердите, что вам есть 13 лет, и согласие с условиями.",
    checkEmailTitle: "Проверьте почту",
    checkEmailBody: "Мы отправили ссылку для подтверждения. Перейдите по ней, чтобы завершить регистрацию.",
    genericError: "Что-то пошло не так. Попробуйте ещё раз.",
  },

  notFound: {
    title: "Страница не найдена",
    body: "Такой страницы не существует или она была перемещена.",
    backHome: "На главную",
  },

  // PLAY-006: a lesson whose metadata is visible (per docs/handoff.md,
  // "preview, precisely") but whose content the caller isn't entitled to —
  // paid, not bought. Plain state only; the real preview screen is M3.
  notAvailable: {
    body: "Этот урок открывается после покупки курса.",
    itemCountLabel: "Заданий",
  },

  // PLAY-006's error boundary (app/(english)/error.tsx) — an invariant break
  // or a failed read, not a learner mistake, so the copy stays generic and
  // gives no internal detail.
  error: {
    title: "Что-то пошло не так",
    body: "Попробуйте ещё раз — обычно это помогает.",
    retry: "Повторить",
    backHome: "На главную",
  },

  // SHELL-012: the sole path off this surface to the Colloquiz shell (/app).
  // Deliberately just a footer line, not nav — see docs/decisions/0062.
  // 2026-09-28: enriched to match the Claude Design landing import's footer
  // (owner overwrite, docs/ui-decisions.md) — still one link off-surface,
  // not nav, so 0062's "not nav" clause still holds; only its "single line"
  // clause is superseded.
  footer: {
    colloquizHeading: "Colloquiz ↗",
    colloquizDesc: "Наше приложение с квизами",
    privacy: "Конфиденциальность",
    copyright: "© 2026 Alliengll",
  },
} as const;
