"use client";

import { useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
// Direct path, not the lesson-player barrel: the barrel pulls the whole
// player (every practice renderer) into `/`'s bundle (docs/decisions/0059).
import { optionClassName } from "@/app/components/lesson-player/practice/optionClassName";
import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import { heroDemoItem, landingCopy } from "./landingCopy";

/**
 * The hero's tappable mini-demo (docs/decisions/0078): one real `selection`
 * item from the Future Imperfect course, answerable in one tap, with the
 * same option styling (`optionClassName`) and correct/wrong markers the real
 * player shows — so the first thing a visitor touches is what a lesson
 * actually feels like. Deliberately NOT `SelectionRenderer`: that would
 * import lib/items' scoring registry for a single hardcoded item, and its
 * separate "Check" step is one tap more than a demo needs. Tapping an option
 * answers immediately; "Try again" resets. Nothing is recorded — this is not
 * a lesson attempt (lib/lessonPlayer/attemptStore.ts never sees it).
 */
export function HeroDemo({ lang }: { lang: SurfaceLang }) {
  const t = landingCopy[lang].demo;
  const [picked, setPicked] = useState<string | null>(null);
  const submitted = picked !== null;
  const isCorrect = picked === heroDemoItem.correctOptionId;

  return (
    <div className="rounded-2xl bg-card p-4 text-card-foreground shadow-2xl shadow-brand-deep/40 ring-1 ring-border sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-subtle px-2.5 py-1 text-xs font-medium text-brand-text">
          <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-brand motion-reduce:animate-none" />
          {t.label}
        </span>
        {!submitted && <span className="text-xs text-muted-foreground">{t.hint}</span>}
      </div>

      <p lang="en" className="mb-3 text-base font-medium text-foreground">
        {heroDemoItem.prompt}
      </p>

      <div role="radiogroup" aria-label={heroDemoItem.prompt} className="flex flex-col gap-2">
        {heroDemoItem.options.map((option) => {
          const wasSelected = picked === option.id;
          const optionCorrect = option.id === heroDemoItem.correctOptionId;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={wasSelected}
              disabled={submitted}
              onClick={() => setPicked(option.id)}
              className={optionClassName({
                isSelected: wasSelected,
                submitted,
                feedback: submitted ? { wasSelected, isCorrect: optionCorrect } : undefined,
              })}
            >
              <span lang="en" className="min-h-6 flex-1">
                {option.text}
              </span>
              {submitted && wasSelected && optionCorrect && (
                <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
              )}
              {submitted && wasSelected && !optionCorrect && (
                <X className="size-4 shrink-0 text-destructive-text" aria-hidden="true" />
              )}
              {submitted && !wasSelected && optionCorrect && (
                <Check className="size-4 shrink-0 text-success/60" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      <div aria-live="polite">
        {submitted && (
          <div className="mt-3 flex flex-col items-start gap-2 animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
            <p className="text-sm">
              <span className={`font-semibold ${isCorrect ? "text-success" : "text-destructive-text"}`}>
                {isCorrect ? t.correct : t.wrong}
              </span>{" "}
              <span className="text-muted-foreground">{t.why}</span>
            </p>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md text-xs font-medium text-brand-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              {t.retry}
            </button>
          </div>
        )}
      </div>

      <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">{t.source}</p>
    </div>
  );
}
