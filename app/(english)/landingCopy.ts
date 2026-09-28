/**
 * Landing-page-only bilingual strings (docs/handoff.md, "Audience and
 * language", 2026-09-28 landing exception). Deliberately separate from
 * lib/alliengll/copy.ts, which stays Russian-only and governs every other
 * route on this surface — do not merge these back together and do not import
 * this file outside app/(english)/page.tsx and its landing components.
 */

export type LandingLang = "ru" | "en";

/** Cookie name for the persisted toggle choice — read server-side by
 * page.tsx, written client-side by LandingContent's toggle handler. */
export const LANDING_LANG_COOKIE = "colloquiz_landing_lang";

export const landingCopy = {
  ru: {
    wordmark: "Alliengll",
    login: "Войти",
    heroTitle: "Английский без напряжения",
    heroSubtitle:
      "Короткие курсы для тех, кто хочет понимать и говорить по-английски — на телефоне, в удобном темпе.",
    ctaPrimary: "Начать бесплатно",
    noAccount: "Для бесплатных уроков регистрация не нужна.",
    catalogueLink: "Все курсы",
    coursesHeading: "Курсы",
    empty: "Курсы скоро появятся — загляните позже.",
    footerDesc: "Наше приложение с квизами",
    footerPrivacy: "Конфиденциальность",
  },
  en: {
    wordmark: "Alliengll",
    login: "Log in",
    heroTitle: "English without the stress",
    heroSubtitle: "Short courses for A2–B2 learners. Study on your phone, at your own pace.",
    ctaPrimary: "Start for free",
    noAccount: "Free lessons don’t need an account.",
    catalogueLink: "All courses",
    coursesHeading: "Courses",
    empty: "Courses are coming soon — check back later.",
    footerDesc: "Our quiz app",
    footerPrivacy: "Privacy",
  },
} as const;
