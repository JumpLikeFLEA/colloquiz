import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";

/**
 * The learner home's strings (PROG-002, docs/decisions/0120). Both languages:
 * `/my` follows the saved EN/RU choice (owner, 2026-10-11), with no toggle of
 * its own. Imported only by Server Components; keep it out of Client
 * Components (docs/decisions/0079, "Budget").
 *
 * New copy, pending owner/partner review.
 */
type MyStrings = {
  metaTitle: string;
  eyebrow: string;
  title: string;
  lead: string;
  backToCatalogue: string;
  nextCallTitle: string;
  join: string;
  coursesTitle: string;
  coursesEmpty: string;
  browseCourses: string;
  attempted: string;
  of: string;
  average: string;
  tierBasic: string;
  tierExtended: string;
  feedbackTitle: string;
  feedbackEmpty: string;
  voiceFeedback: string;
  finalComment: string;
  openLesson: string;
  openBeforeAfter: string;
  teachersTitle: string;
  teachersLead: string;
  linkedSince: string;
  leave: string;
  leaveConfirm: (teacher: string) => string;
  leaveConfirmYes: string;
  leaveCancel: string;
  /** The Messages section (TCH-004, docs/decisions/0151). */
  messagesTitle: string;
  messagesOpen: string;
  messagesNew: (n: number) => string;
  messagesNone: string;
};

export const myCopy: Record<SurfaceLang, MyStrings> = {
  ru: {
    metaTitle: "Мои курсы",
    eyebrow: "Личный кабинет",
    title: "Мои курсы",
    lead: "Ваши курсы, прогресс и отзывы преподавателя в одном месте.",
    backToCatalogue: "Все курсы",
    nextCallTitle: "Следующий созвон",
    join: "Подключиться",
    coursesTitle: "Курсы",
    coursesEmpty: "Вы ещё не начали ни одного курса.",
    browseCourses: "Выбрать курс",
    attempted: "пройдено уроков",
    of: "из",
    average: "средний результат",
    tierBasic: "Базовый",
    tierExtended: "Расширенный",
    feedbackTitle: "Отзывы",
    feedbackEmpty: "Отзывов пока нет. Они появятся здесь, когда преподаватель ответит на ваши записи.",
    voiceFeedback: "Отзыв на запись",
    finalComment: "Итоговый комментарий",
    openLesson: "Открыть урок",
    openBeforeAfter: "До и после",
    teachersTitle: "Ваши преподаватели",
    teachersLead: "Преподаватель видит ваши ответы и результаты, пока вы подключены. Отключиться можно в любой момент.",
    linkedSince: "Подключены с",
    leave: "Отключиться",
    leaveConfirm: (teacher) => `Отключиться от ${teacher}? Преподаватель перестанет видеть ваши ответы и результаты. Переписка останется у вас обоих, но новые сообщения будут недоступны.`,
    leaveConfirmYes: "Да, отключиться",
    leaveCancel: "Отмена",
    messagesTitle: "Сообщения",
    messagesOpen: "Переписка с преподавателями",
    messagesNew: (n) => `Новых: ${n}`,
    messagesNone: "Нет новых сообщений",
  },
  en: {
    metaTitle: "My courses",
    eyebrow: "Your account",
    title: "My courses",
    lead: "Your courses, your progress and your teacher's feedback in one place.",
    backToCatalogue: "All courses",
    nextCallTitle: "Next call",
    join: "Join",
    coursesTitle: "Courses",
    coursesEmpty: "You haven't started a course yet.",
    browseCourses: "Browse courses",
    attempted: "lessons completed",
    of: "of",
    average: "average score",
    tierBasic: "Basic",
    tierExtended: "Extended",
    feedbackTitle: "Feedback",
    feedbackEmpty: "No feedback yet. It appears here when your teacher answers your recordings.",
    voiceFeedback: "Feedback on your recording",
    finalComment: "Final comment",
    openLesson: "Open lesson",
    openBeforeAfter: "Before and after",
    teachersTitle: "Your teachers",
    teachersLead: "A teacher sees your answers and scores while you are linked. You can leave at any time.",
    linkedSince: "Linked since",
    leave: "Leave",
    leaveConfirm: (teacher) => `Leave ${teacher}? They will no longer see your answers or scores. Your conversation stays readable to both of you but takes no new messages.`,
    leaveConfirmYes: "Yes, leave",
    leaveCancel: "Cancel",
    messagesTitle: "Messages",
    messagesOpen: "Conversations with your teachers",
    messagesNew: (n) => `${n} new`,
    messagesNone: "No new messages",
  },
};
