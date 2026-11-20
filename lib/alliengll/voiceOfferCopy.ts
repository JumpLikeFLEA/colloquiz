import type { SurfaceLang } from "./surfaceLang";

/**
 * Two small pieces of copy around the AI feedback on a free lesson (VOICE-018,
 * docs/decisions/0231), in the saved EN/RU choice (the lesson page's other chrome is English,
 * 0080 Decision 5; these two follow the choice because they are the page speaking to a prospect,
 * not player chrome). Kept in its own module so it ships only in the recorder's lazy chunk.
 *
 * Neither says what the course will do for the learner, and neither carries a price: no course
 * column holds one (0231 Decision 2). The model never writes either (0229 Decision 5).
 */
export const voiceOfferCopy: Record<
  SurfaceLang,
  { offerBody: string; offerCta: string; signInBody: string; signInCta: string; signInNote: string }
> = {
  en: {
    offerBody: "The lessons above are part of the full course.",
    offerCta: "How to get access",
    signInBody: "Sign in to send this recording and get AI feedback on it.",
    signInCta: "Sign in to send",
    signInNote: "You'll come back to this task. Recordings stay on this device, so record again after you sign in.",
  },
  ru: {
    offerBody: "Эти уроки входят в полный курс.",
    offerCta: "Как получить доступ",
    signInBody: "Войдите, чтобы отправить запись и получить на неё ИИ-разбор.",
    signInCta: "Войти и отправить",
    signInNote: "Вы вернётесь к этому заданию. Записи хранятся только на устройстве, поэтому после входа запишите ещё раз.",
  },
};
