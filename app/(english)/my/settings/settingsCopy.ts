import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";

/**
 * The learner's settings page strings (docs/decisions/0181). Both languages:
 * like `/my`, the page follows the saved EN/RU choice with no toggle of its
 * own (docs/decisions/0120). Imported only by the Server Component page,
 * which passes each client section its own labels as props, so one language
 * reaches the client and copy.ts stays out of it (docs/decisions/0079,
 * "Budget"). Every value is a string, because a function can't cross to a
 * Client Component as a prop; `{name}` placeholders are filled in by the
 * section.
 *
 * The English labels for export and delete ("Export my data", "Delete my
 * account") are the ones privacy policy §8 names. The delete effects follow
 * §9, not the Colloquiz list, which is about quizzes and leaderboards.
 *
 * New copy, pending owner/partner review.
 */
export type AppearanceLabels = {
  legend: string;
  light: string;
  dark: string;
  system: string;
  /** "{mode}" is `modeDark` or `modeLight`. */
  followingDevice: string;
  deviceIs: string;
  modeDark: string;
  modeLight: string;
  savedNote: string;
  /** "{error}" is the database's message. */
  syncError: string;
};

export type SignInLabels = {
  /** "{error}" is the read's message. */
  loadError: string;
  emailPassword: string;
  connected: string;
  notConnected: string;
  onlyMethod: string;
  onlyMethodTitle: string;
  emailAddedBySignup: string;
  connect: string;
  disconnect: string;
  inAppNote: string;
  /** "{provider}" is the method's name. */
  confirmTitle: string;
  confirmBody: string;
  cancel: string;
  disconnected: string;
  /** "{error}" is Supabase Auth's message. */
  actionError: string;
};

export type DataLabels = {
  exportTitle: string;
  exportBody: string;
  exportButton: string;
  exportBusy: string;
  exportRateLimited: string;
  /** "{status}" is the HTTP status. */
  exportFailed: string;
  exportNetwork: string;
  deleteTitle: string;
  deleteBody: string;
  deleteButton: string;
  dialogTitle: string;
  dialogDescription: string;
  effects: string[];
  retained: string;
  ownsGroups: string;
  confirmBefore: string;
  confirmAfter: string;
  cancel: string;
  deleting: string;
  deleteFailed: string;
  deleteNetwork: string;
};

type SettingsStrings = {
  metaTitle: string;
  eyebrow: string;
  title: string;
  lead: string;
  backToMy: string;
  appearanceTitle: string;
  appearanceLead: string;
  signInTitle: string;
  signInLead: string;
  dataTitle: string;
  dataLead: string;
  legalPrefix: string;
  legalTerms: string;
  legalJoiner: string;
  legalPrivacy: string;
  appearance: AppearanceLabels;
  signIn: SignInLabels;
  data: DataLabels;
};

export const settingsCopy: Record<SurfaceLang, SettingsStrings> = {
  ru: {
    metaTitle: "Настройки",
    eyebrow: "Ваш аккаунт",
    title: "Настройки",
    lead: "Тема, способы входа и ваши данные.",
    backToMy: "Мои курсы",
    appearanceTitle: "Оформление",
    appearanceLead: "Как выглядит сайт. Меняется сразу.",
    signInTitle: "Способы входа",
    signInLead: "Как вы входите в этот аккаунт. Хотя бы один способ остаётся всегда.",
    dataTitle: "Данные и конфиденциальность",
    dataLead: "Скачайте копию своих данных или удалите аккаунт навсегда.",
    legalPrefix: "Документы (на английском):",
    legalTerms: "Условия использования",
    legalJoiner: "и",
    legalPrivacy: "Политика конфиденциальности",
    appearance: {
      legend: "Тема",
      light: "Светлая",
      dark: "Тёмная",
      system: "Как на устройстве",
      followingDevice: "Как на вашем устройстве: сейчас там {mode} тема.",
      deviceIs: "На вашем устройстве сейчас {mode} тема.",
      modeDark: "тёмная",
      modeLight: "светлая",
      savedNote: "Сохраняется в аккаунте, поэтому действует и на других ваших устройствах, и в Colloquiz.",
      syncError: "Тема изменилась на этом устройстве, но не сохранилась в аккаунте: {error}",
    },
    signIn: {
      loadError: "Не удалось загрузить способы входа: {error}",
      emailPassword: "Email и пароль",
      connected: "Подключено",
      notConnected: "Не подключено",
      onlyMethod: "Это ваш единственный способ входа. Сначала подключите другой.",
      onlyMethodTitle: "Единственный способ входа нельзя отключить",
      emailAddedBySignup: "Появляется, если зарегистрироваться по email и паролю.",
      connect: "Подключить",
      disconnect: "Отключить",
      inAppNote:
        "Во встроенном браузере Instagram или Telegram подключить Telegram, Google или Discord нельзя. Откройте эту страницу в обычном браузере.",
      confirmTitle: "Отключить {provider}?",
      confirmBody:
        "Вы больше не сможете входить через {provider}. Подключить снова можно в любой момент. Ваши курсы и прогресс не изменятся.",
      cancel: "Отмена",
      disconnected: "{provider} отключён.",
      actionError: "Не получилось: {error}",
    },
    data: {
      exportTitle: "Скачать мои данные",
      exportBody:
        "Файл JSON со всем, что хранится в аккаунте: ответы в уроках, записи голоса с отзывами, сообщения с преподавателями и остальное.",
      exportButton: "Скачать",
      exportBusy: "Готовим…",
      exportRateLimited: "Вы уже несколько раз скачивали данные за последний час. Попробуйте чуть позже.",
      exportFailed: "Не удалось скачать (ошибка {status}).",
      exportNetwork: "Не удалось скачать. Проверьте подключение и попробуйте ещё раз.",
      deleteTitle: "Удалить аккаунт",
      deleteBody:
        "Аккаунт закроется, а ваши личные данные будут стёрты. Это нельзя отменить: если нужна копия, сначала скачайте данные.",
      deleteButton: "Удалить аккаунт",
      dialogTitle: "Удалить аккаунт?",
      dialogDescription: "Это навсегда, отменить нельзя.",
      effects: [
        "Стирает ваше имя, город и фото профиля",
        "Стирает ваши ответы и баллы в уроках, открытые уроки, записи на курсы и то, откуда вы пришли",
        "Стирает ваши записи голоса и отзывы и итоговые комментарии к ним",
        "Завершает связь с преподавателями и удаляет переписку с ними целиком, с обеих сторон",
        "Убирает вас из групп и домашних заданий преподавателей, удаляет ссылку на календарь и напоминания в Telegram",
        "Закрывает вход в аккаунт навсегда",
      ],
      retained:
        "Если вы играли в квизы Colloquiz, ваши результаты и созданные вами вопросы и квизы остаются в обезличенном виде, без связи с вами, чтобы не пострадали истории других участников.",
      ownsGroups: "У вас есть группы в Colloquiz, где есть другие участники. Сначала передайте их или удалите участников:",
      confirmBefore: "Введите",
      confirmAfter: "для подтверждения",
      cancel: "Отмена",
      deleting: "Удаляем…",
      deleteFailed: "Не удалось удалить аккаунт (ошибка {status}).",
      deleteNetwork: "Не удалось удалить аккаунт. Проверьте подключение и попробуйте ещё раз.",
    },
  },
  en: {
    metaTitle: "Settings",
    eyebrow: "Your account",
    title: "Settings",
    lead: "Theme, sign-in methods and your data.",
    backToMy: "My courses",
    appearanceTitle: "Appearance",
    appearanceLead: "How the site looks. Changes apply straight away.",
    signInTitle: "Sign-in methods",
    signInLead: "How you sign in to this account. You always keep at least one.",
    dataTitle: "Data and privacy",
    dataLead: "Take a copy of your data, or close your account for good.",
    legalPrefix: "Read our",
    legalTerms: "Terms of Service",
    legalJoiner: "and",
    legalPrivacy: "Privacy Policy",
    appearance: {
      legend: "Theme",
      light: "Light",
      dark: "Dark",
      system: "System",
      followingDevice: "Following your device, which is currently {mode}.",
      deviceIs: "Your device is currently {mode}.",
      modeDark: "dark",
      modeLight: "light",
      savedNote: "Saved to your account, so it follows you to your other devices and to Colloquiz.",
      syncError: "The theme changed on this device, but couldn't be saved to your account: {error}",
    },
    signIn: {
      loadError: "Couldn't load your sign-in methods: {error}",
      emailPassword: "Email & password",
      connected: "Connected",
      notConnected: "Not connected",
      onlyMethod: "This is your only sign-in method. Connect another one before disconnecting it.",
      onlyMethodTitle: "You can't disconnect your only sign-in method",
      emailAddedBySignup: "Added by signing up with an email and password.",
      connect: "Connect",
      disconnect: "Disconnect",
      inAppNote:
        "Telegram, Google and Discord can't be connected in the Instagram or Telegram in-app browser. Open this page in your regular browser.",
      confirmTitle: "Disconnect {provider}?",
      confirmBody:
        "You'll no longer be able to sign in with {provider}. You can reconnect it later. Your courses and progress are unaffected.",
      cancel: "Cancel",
      disconnected: "{provider} disconnected.",
      actionError: "That didn't work: {error}",
    },
    data: {
      exportTitle: "Export my data",
      exportBody:
        "A JSON file of everything this account holds: your lesson answers, voice recordings and their feedback, your messages with teachers, and the rest.",
      exportButton: "Download export",
      exportBusy: "Preparing…",
      exportRateLimited: "You've exported your data several times in the last hour. Please try again a little later.",
      exportFailed: "Export failed ({status}).",
      exportNetwork: "Export failed. Check your connection and try again.",
      deleteTitle: "Delete my account",
      deleteBody:
        "Closes your account and erases your personal details. This cannot be undone, so export your data first if you want a copy.",
      deleteButton: "Delete account",
      dialogTitle: "Delete your account?",
      dialogDescription: "This is permanent and cannot be undone.",
      effects: [
        "Erases your name, city and profile picture",
        "Erases your lesson answers and scores, the lessons you opened, your course enrolments and how you signed up",
        "Erases your voice recordings and the feedback and final comments on them",
        "Ends your teacher links and deletes your conversations with teachers, on both sides",
        "Takes you out of your teachers' groups and homework, and deletes your calendar link and Telegram reminders",
        "Closes your sign-in, permanently",
      ],
      retained:
        "If you played Colloquiz quizzes, your quiz results and any questions or quizzes you contributed are kept in anonymised form, with no link back to you, so other members' histories stay intact.",
      ownsGroups: "You still own Colloquiz groups with other members. Transfer ownership or remove the members first:",
      confirmBefore: "Type",
      confirmAfter: "to confirm",
      cancel: "Cancel",
      deleting: "Deleting…",
      deleteFailed: "Deletion failed ({status}).",
      deleteNetwork: "Deletion failed. Check your connection and try again.",
    },
  },
};
