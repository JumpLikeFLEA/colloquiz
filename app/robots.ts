import type { MetadataRoute } from "next";

/**
 * 1.0 launches "public but unlisted" — signups are open, but the app must not
 * be indexed (locked decision, DoR). A blanket disallow keeps every route out
 * of search results; there is deliberately no sitemap for the same reason.
 *
 * NOTE: `/robots.txt` must be allow-listed in proxy.ts `publicRoutes`, or the
 * unauthenticated proxy bounces it to /login and crawlers never see the rule.
 *
 * SHELL-016 — a second, more specific `User-agent: TelegramBot` rule with an
 * empty `Disallow:` exempts Telegram's own link-preview fetcher from the
 * blanket disallow above, so a course/lesson URL shared in Telegram gets a
 * rich preview (docs/decisions/0065 confirmed TelegramBot is blocked by the
 * blanket rule like any other crawler — third-party documentation of its
 * behaviour, not a first-party Telegram statement or a live observation).
 * This is the documented Robots Exclusion Standard syntax for exempting one
 * named agent from a `User-agent: * / Disallow: /` block: a more specific
 * `User-agent` match takes precedence over the wildcard for that agent, and
 * an empty `Disallow:` value means "disallow nothing" for it. No other
 * crawler gets a rule of its own — the site-wide "public but unlisted, not
 * indexed" stance is otherwise unchanged.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: "/",
      },
      {
        userAgent: "TelegramBot",
        disallow: "",
      },
    ],
  };
}
