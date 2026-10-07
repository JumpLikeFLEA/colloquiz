/**
 * Learner-facing chrome strings for the English (Alliengll) surface that
 * have ONE fixed language — player buttons, completion screen, signup
 * offer, not-found — in Russian (docs/handoff.md, "Audience and language",
 * 2026-09-24 delta). Not an i18n layer: no locale selection, no library, no
 * fallback. The landing page (app/(english)/landingCopy.ts), the course page
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

  // The course page's own strings moved to app/(english)/courses/
  // [courseSlug]/courseCopy.ts (docs/decisions/0080: it follows the EN/RU
  // toggle now). These two are still read by the lesson band and the
  // completion card.
  course: {
    exercises: { one: "задание", few: "задания", many: "заданий", other: "задания" },
    minutesLabel: "мин",
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
    // docs/decisions/0079 D7: "17 из 20" under the score, and the card shown
    // until every exercise is answered ("Осталось 3 задания").
    scoreOf: "из",
    remainingPrefix: "Осталось",
    remainingBody: "Ответьте на все задания — и здесь появится ваш результат.",
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
  },

  // PLAY-006's error boundary strings moved to lib/alliengll/errorCopy.ts
  // (docs/decisions/0079, "Budget"): the boundary is a Client Component that
  // ships with every page, and importing this object there put all of it in
  // the client JS of `/`.

  // The footer's strings moved to app/(english)/footerCopy.ts (docs/
  // decisions/0080): the footer follows the EN/RU choice on course pages.
} as const;
