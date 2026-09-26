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

  landing: {
    heroTitle: "Английский без напряжения",
    heroSubtitle:
      "Короткие курсы для тех, кто хочет понимать и говорить по-английски — на телефоне, в удобном темпе.",
    ctaPrimary: "Начать бесплатно",
    catalogueLink: "Все курсы",
  },

  catalogue: {
    title: "Курсы",
    empty: "Курсы скоро появятся — загляните позже.",
    freeSampleBadge: "Бесплатно",
  },

  course: {
    lessonsLabel: "уроков",
    startFirstFree: "Начать первый бесплатный урок",
    progressAttempted: "пройдено уроков",
    progressAverage: "средний результат",
  },

  player: {
    submit: "Проверить",
    next: "Далее",
    retry: "Пройти ещё раз",
    backToCourse: "Назад к курсу",
    why: "Почему?",
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
} as const;
