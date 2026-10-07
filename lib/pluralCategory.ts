/**
 * Count-noun agreement for the landing page's bilingual strings ("1 урок /
 * 3 урока / 5 уроков", "1 lesson / 5 lessons"). Built on the platform's
 * Intl.PluralRules, so it costs no bundle bytes — no plural library, no
 * i18n layer (docs/handoff.md, "Audience and language").
 */

export type PluralLocale = "ru" | "en";

export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

const rulesByLocale = new Map<PluralLocale, Intl.PluralRules>();

function rulesFor(locale: PluralLocale): Intl.PluralRules {
  let rules = rulesByLocale.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    rulesByLocale.set(locale, rules);
  }
  return rules;
}

/** The form of `forms` that agrees with `n` in `locale`; `other` when the
 * locale's category has no entry. */
export function pluralize(n: number, locale: PluralLocale, forms: PluralForms): string {
  return forms[rulesFor(locale).select(n)] ?? forms.other;
}
