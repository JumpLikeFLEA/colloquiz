import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";

/**
 * PROG-008 (docs/decisions/0209) — the page a course-complete share link opens.
 * Follows the saved EN/RU choice with no toggle, like /my (0120). The share
 * card (`opengraph-image.tsx`) is English: Telegram caches one preview per URL,
 * so it cannot follow the reader's cookie.
 */
export const completedCopy: Record<SurfaceLang, { eyebrow: string; body: string; cta: string }> = {
  ru: {
    eyebrow: "Курс пройден",
    body: "Этот курс прошли до конца на Alina Cher. Попробуй: короткие уроки по 10–15 минут.",
    cta: "Открыть курс",
  },
  en: {
    eyebrow: "Course complete",
    body: "Someone finished this course on Alina Cher. Try it yourself: short lessons, 10–15 minutes each.",
    cta: "Open the course",
  },
};

/** The share card's pill; English, see above. */
export const completedOgEyebrow = completedCopy.en.eyebrow;
