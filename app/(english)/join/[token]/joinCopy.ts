import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";

/**
 * TCH-001 — the join page's strings (docs/decisions/0148). Both languages:
 * the page follows the saved EN/RU choice with no toggle of its own, the
 * /my precedent (docs/decisions/0120). Imported only by the Server
 * Component page.
 *
 * New copy, pending owner/partner review.
 */
type JoinStrings = {
  metaTitle: string;
  eyebrow: string;
  headingFor: (teacher: string) => string;
  signedOutBody: string;
  signedOutCta: string;
  joiningAs: string;
  joiningSignedIn: string;
  otherAccount: string;
  join: string;
  alreadyLinked: { title: string; body: string };
  self: { title: string; body: string };
  notFound: { title: string; body: string };
  myCourses: string;
  home: string;
  back: string;
};

export const joinCopy: Record<SurfaceLang, JoinStrings> = {
  en: {
    metaTitle: "Link to your teacher",
    eyebrow: "Teacher",
    headingFor: (teacher) => `Link to ${teacher}`,
    signedOutBody: "Sign in or create an account to link. Use the account you study with.",
    signedOutCta: "Sign in or create an account",
    joiningAs: "You’ll link as",
    joiningSignedIn: "You’ll link with the account you’re signed in to.",
    otherAccount: "Not you? Sign out from the menu at the top and sign in with the right account.",
    join: "Join",
    alreadyLinked: {
      title: "You’re already linked",
      body: "This account is already linked to this teacher. You can leave at any time in My courses.",
    },
    self: {
      title: "This is your own student link",
      body: "Send it to the people you teach. Opening it yourself links nobody.",
    },
    notFound: {
      title: "This link isn’t valid",
      body: "Check that you opened the whole link, or ask your teacher for a new one. A teacher’s link stops working when they replace it.",
    },
    myCourses: "Go to My courses",
    home: "Go to the home page",
    back: "All courses",
  },
  ru: {
    metaTitle: "Подключиться к преподавателю",
    eyebrow: "Преподаватель",
    headingFor: (teacher) => `Подключиться к ${teacher}`,
    signedOutBody: "Войдите или создайте аккаунт, чтобы подключиться. Используйте аккаунт, с которым вы учитесь.",
    signedOutCta: "Войти или создать аккаунт",
    joiningAs: "Вы подключитесь как",
    joiningSignedIn: "Вы подключитесь с аккаунтом, в который вошли.",
    otherAccount: "Это не вы? Выйдите из аккаунта в меню сверху и войдите в нужный.",
    join: "Подключиться",
    alreadyLinked: {
      title: "Вы уже подключены",
      body: "Этот аккаунт уже подключён к этому преподавателю. Отключиться можно в любой момент в разделе «Мои курсы».",
    },
    self: {
      title: "Это ваша собственная ссылка для учеников",
      body: "Отправьте её тем, кого вы учите. Если открыть её самому, никто не подключится.",
    },
    notFound: {
      title: "Эта ссылка не работает",
      body: "Проверьте, что открыли ссылку целиком, или попросите у преподавателя новую. Ссылка перестаёт работать, когда преподаватель заменяет её.",
    },
    myCourses: "Перейти в «Мои курсы»",
    home: "На главную",
    back: "Все курсы",
  },
};
