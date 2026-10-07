import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import type { PluralForms } from "@/lib/pluralCategory";

/**
 * The course page's chrome, in both languages (docs/decisions/0080: the
 * landing and the course pages share one EN/RU toggle). Moved out of
 * lib/alliengll/copy.ts, which no longer covers this page. Only chrome:
 * the course's title, description and lesson titles are authored content
 * and render as written.
 *
 * Imported only by Server Components (page.tsx, CourseHero,
 * LessonListItem), so neither language reaches the client bundle; keep it
 * out of Client Components on this route (docs/decisions/0079, "Budget").
 *
 * The Russian strings are the 0079 course-page copy, unchanged; the English
 * ones are new. Both are pending owner/partner review.
 */
type CourseStrings = {
  languageGroupLabel: string;
  backToCatalogue: string;
  startFirstFree: string;
  startCourse: string;
  allFree: string;
  progressAttempted: string;
  progressAverage: string;
  progressOf: string;
  lessons: PluralForms;
  exercises: PluralForms;
  minutesLabel: string;
  freeBadge: string;
  bestScoreLabel: string;
  aboutTitle: string;
  lessonsEyebrow: string;
  lessonsTitle: string;
  noFreeLesson: string;
  noLessons: string;
};

export const courseCopy: Record<SurfaceLang, CourseStrings> = {
  ru: {
    languageGroupLabel: "Язык",
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
  en: {
    languageGroupLabel: "Language",
    backToCatalogue: "All courses",
    startFirstFree: "Start the first free lesson",
    startCourse: "Start the course",
    allFree: "Whole course free",
    progressAttempted: "lessons attempted",
    progressAverage: "average score",
    progressOf: "of",
    lessons: { one: "lesson", other: "lessons" },
    exercises: { one: "exercise", other: "exercises" },
    minutesLabel: "min",
    freeBadge: "Free",
    bestScoreLabel: "Best",
    aboutTitle: "About the course",
    lessonsEyebrow: "Syllabus",
    lessonsTitle: "Lessons",
    noFreeLesson: "Free lessons are coming soon",
    noLessons: "Lessons are coming soon — check back later.",
  },
};
